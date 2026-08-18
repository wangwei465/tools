import { NextResponse } from "next/server";
import { resolveConnection } from "@/lib/datastore/resolve";
import { describeEsError, esRequest, parseSearchResponse } from "@/lib/datastore/es";
import { classifyEsOperation, classifyMongoOperation, gateOperation, type GateResult } from "@/lib/datastore/safety";
import {
  mongoAggregate,
  mongoDeleteMany,
  mongoFind,
  mongoUpdateMany,
} from "@/lib/datastore/mongo";
import type { DatastoreConnection } from "@/lib/datastore/types";

/**
 * POST /api/datastore/query → 查询台执行入口
 *
 * ES   { kind:"es",    connId, method, path, body?, confirm? }
 * Mongo{ kind:"mongo", connId, db, collection, op, ...参数, confirm? }
 *
 * 安全闸门（服务端硬编码判定，不信任前端）：
 * - 只读模式 + 写操作 → 拦截（blocked:"readonly"）
 * - 危险操作 + 未确认 → 要求二次确认（needConfirm:true，回传完整操作描述供弹窗回显）
 *
 * 执行错误原样翻译为可读原因回显（ok:false, error），不视为服务异常，故 HTTP 恒 200。
 */
interface QueryBody {
  kind?: string;
  connId?: number;
  confirm?: boolean;
  // ES
  method?: string;
  path?: string;
  body?: unknown;
  // Mongo
  db?: string;
  collection?: string;
  op?: string;
  filter?: unknown;
  projection?: unknown;
  sort?: unknown;
  skip?: number;
  limit?: number;
  pipeline?: unknown;
  update?: unknown;
}

export async function POST(request: Request) {
  let payload: QueryBody;
  try {
    payload = (await request.json()) as QueryBody;
  } catch {
    return NextResponse.json({ ok: false, error: "请求体不是合法 JSON" }, { status: 400 });
  }

  let conn: DatastoreConnection;
  try {
    conn = resolveConnection(payload.connId);
  } catch (err) {
    return NextResponse.json({ ok: false, error: msg(err, "连接不存在") });
  }

  switch (payload.kind) {
    case "es":
      return runEsQuery(conn, payload);
    case "mongo":
      return runMongoQuery(conn, payload);
    default:
      return NextResponse.json(
        { ok: false, error: `不支持的查询类型：${payload.kind ?? "(空)"}` },
        { status: 400 }
      );
  }
}

/* ─── Elasticsearch ───────────────────────────────────────── */

async function runEsQuery(conn: DatastoreConnection, payload: QueryBody) {
  if (conn.type !== "es") {
    return NextResponse.json({ ok: false, error: "所选连接不是 Elasticsearch" });
  }

  const method = (payload.method || "POST").trim().toUpperCase();
  const path = (payload.path || "").trim();
  if (!path) {
    return NextResponse.json({ ok: false, error: "请求路径不能为空" });
  }

  const gate = gateOperation({
    cls: classifyEsOperation(method, path),
    conn,
    description: describeEsOperation(method, path, payload.body),
    confirm: payload.confirm,
  });
  if (!gate.allowed) return NextResponse.json(gateRejection(gate));

  try {
    const res = await esRequest(conn, method, path, payload.body);
    if (!res.ok) {
      // 深分页触顶等已在 describeEsError 内翻译为可读出路，不透出底层错误
      return NextResponse.json({ ok: false, error: describeEsError(res.status, res.body) });
    }
    return NextResponse.json({
      ok: true,
      result: parseSearchResponse(res.body),
      tookMs: res.tookMs,
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: msg(err, "查询失败") });
  }
}

/* ─── MongoDB ─────────────────────────────────────────────── */

/**
 * Mongo 分支：find / aggregate 为读，updateMany / deleteMany 为写。
 * 写操作不做可视化编辑，靠手写过滤条件与更新文档提交，一律经同一套闸门判定。
 */
async function runMongoQuery(conn: DatastoreConnection, payload: QueryBody) {
  if (conn.type !== "mongo") {
    return NextResponse.json({ ok: false, error: "所选连接不是 MongoDB" });
  }

  const db = (payload.db ?? "").trim();
  const collection = (payload.collection ?? "").trim();
  const op = (payload.op ?? "").trim();
  if (!db) return NextResponse.json({ ok: false, error: "请先选择数据库" });
  if (!collection) return NextResponse.json({ ok: false, error: "请先选择集合" });

  // 聚合管道必须是数组：非数组时前置报错，不发起查询
  if (op === "aggregate" && !Array.isArray(payload.pipeline)) {
    return NextResponse.json({ ok: false, error: "聚合管道必须为 JSON 数组" });
  }

  const gate = gateOperation({
    cls: classifyMongoOperation(op, payload.filter),
    conn,
    description: describeMongoOperation(db, collection, op, payload),
    confirm: payload.confirm,
  });
  if (!gate.allowed) return NextResponse.json(gateRejection(gate));

  try {
    const result = await execMongo(conn, db, collection, op, payload);
    return NextResponse.json({ ok: true, docs: result.docs, tookMs: result.tookMs });
  } catch (err) {
    // 驱动的报错（管道阶段非法、操作符不存在等）原样回显，供用户定位
    return NextResponse.json({ ok: false, error: msg(err, "查询失败") });
  }
}

function execMongo(
  conn: DatastoreConnection,
  db: string,
  collection: string,
  op: string,
  payload: QueryBody
) {
  switch (op) {
    case "find":
      return mongoFind(conn, db, collection, {
        filter: payload.filter,
        projection: payload.projection,
        sort: payload.sort,
        skip: payload.skip,
        limit: payload.limit,
      });
    case "aggregate":
      return mongoAggregate(
        conn,
        db,
        collection,
        payload.pipeline as Array<Record<string, unknown>>
      );
    case "updateMany":
      return mongoUpdateMany(conn, db, collection, payload.filter, payload.update);
    case "deleteMany":
      return mongoDeleteMany(conn, db, collection, payload.filter);
    default:
      throw new Error(`不支持的操作：${op || "(空)"}`);
  }
}

/** 待确认操作的完整描述，形如 `db.coll.deleteMany({...})`。 */
function describeMongoOperation(
  db: string,
  collection: string,
  op: string,
  payload: QueryBody
): string {
  const arg = op === "aggregate" ? payload.pipeline : payload.filter;
  let argText = "{}";
  try {
    argText = JSON.stringify(arg ?? {}, null, 2);
  } catch {
    /* 保留默认 */
  }
  return `${db}.${collection}.${op}(${argText})`;
}

/** 闸门拒绝的响应信封（ES 与 Mongo 分支共用）。 */
function gateRejection(gate: GateResult) {
  return {
    ok: false,
    error: gate.error,
    blocked: gate.blocked,
    needConfirm: gate.needConfirm,
    description: gate.description,
  };
}

/** 待确认操作的完整描述：方法 + 路径 + Body 摘要，供确认弹窗原样回显。 */
function describeEsOperation(method: string, path: string, body: unknown): string {
  const head = `${method} ${path.startsWith("/") ? path : `/${path}`}`;
  if (body === undefined || body === null) return head;
  try {
    return `${head}\n${JSON.stringify(body, null, 2)}`;
  } catch {
    return head;
  }
}

function msg(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}
