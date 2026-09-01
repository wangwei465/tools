import { NextResponse } from "next/server";
import { getDatastoreConnection } from "@/lib/db";
import { esPing } from "@/lib/datastore/es";
import { buildMongoClient } from "@/lib/datastore/pool";
import { describeRdbError, pingRdbOnce } from "@/lib/datastore/rdb-driver";
import {
  MASKED_SECRET,
  isRdbType,
  parseExtra,
  type DatastoreConnection,
  type DatastoreConnectionInput,
} from "@/lib/datastore/types";

/** 连接测试超时：比常规请求更短，尽快给出结论。 */
const TEST_TIMEOUT_MS = 6000;

/** 各类型的地址字段中文名，用于「不能为空」这类前置校验的提示。 */
const URI_LABEL: Record<string, string> = {
  es: "服务地址",
  mongo: "连接串",
  mysql: "主机地址",
  postgres: "主机地址",
};

/**
 * POST /api/datastore/test → 连通性测试
 *
 * 入参为完整连接配置（可以是尚未保存的表单内容），附带可选 id：
 * 表单里的凭证是脱敏占位符时，按 id 取回已保存的明文，令「不改密码直接测试」可用。
 * ES 走 `GET /` 取版本，Mongo 走 admin ping + buildInfo，关系型走 VERSION()；
 * 三者都临时建连、用完即弃，不污染连接池。
 *
 * 返回 { ok, version?, latencyMs? } 或 { ok:false, error }（可读原因，不抛未捕获异常）。
 */
export async function POST(request: Request) {
  let body: DatastoreConnectionInput & { id?: number };
  try {
    body = (await request.json()) as DatastoreConnectionInput & { id?: number };
  } catch {
    return NextResponse.json({ ok: false, error: "请求体不是合法 JSON" }, { status: 400 });
  }

  if (!body.uri?.trim()) {
    const label = URI_LABEL[body.type ?? "es"] ?? "服务地址";
    return NextResponse.json({ ok: false, error: `${label}不能为空` }, { status: 400 });
  }

  const conn = toTempConnection(body);
  const start = Date.now();
  try {
    const version = await pingByType(conn);
    return NextResponse.json({ ok: true, version, latencyMs: Date.now() - start });
  } catch (err) {
    return NextResponse.json({ ok: false, error: describeError(conn, err) });
  }
}

/** 按类型分流到各自的连通性探测。 */
function pingByType(conn: DatastoreConnection): Promise<string> {
  if (isRdbType(conn.type)) return pingRdbOnce(conn);
  if (conn.type === "mongo") return pingMongo(conn);
  return esPing(conn, TEST_TIMEOUT_MS).then((r) => r.version);
}

/** 合成一个临时连接对象（id 仅占位，测试不入池）。 */
function toTempConnection(input: DatastoreConnectionInput & { id?: number }): DatastoreConnection {
  const saved = input.id ? getDatastoreConnection(Number(input.id)) : null;
  const extra = parseExtra(input.extraJson);
  if (extra.apiKey === MASKED_SECRET) {
    extra.apiKey = parseExtra(saved?.extraJson).apiKey ?? "";
  }

  return {
    id: -1,
    name: input.name ?? "test",
    type: input.type ?? "es",
    uri: input.uri.trim(),
    username: input.username ?? "",
    password: input.password === MASKED_SECRET ? saved?.password ?? "" : input.password ?? "",
    extraJson: JSON.stringify(extra),
    env: input.env ?? "local",
    mode: input.mode ?? "rw",
    createdAt: "",
    updatedAt: "",
  };
}

/** Mongo：ping 确认可达，再取 buildInfo 的版本号用于回显。 */
async function pingMongo(conn: DatastoreConnection): Promise<string> {
  const client = buildMongoClient(conn, TEST_TIMEOUT_MS);
  try {
    const admin = client.db().admin();
    await admin.ping();
    const info = (await admin.buildInfo()) as { version?: string };
    return info.version ?? "未知";
  } finally {
    await client.close().catch(() => {
      /* 忽略断连异常 */
    });
  }
}

/** 驱动 / fetch 的原始异常翻译为可读原因。 */
function describeError(conn: DatastoreConnection, err: unknown): string {
  if (isRdbType(conn.type)) return describeRdbError(conn.type, err);

  const raw = err instanceof Error ? err.message : String(err);
  if (/Authentication failed|not authorized|bad auth/i.test(raw)) {
    return `认证失败：${raw}`;
  }
  if (/Server selection timed out|timed out/i.test(raw)) {
    return `连接超时：${raw}`;
  }
  if (/ECONNREFUSED|getaddrinfo|ENOTFOUND/i.test(raw)) {
    return `地址不可达：${raw}`;
  }
  return raw || "连接失败";
}
