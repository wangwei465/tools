import { NextResponse } from "next/server";
import { resolveConnection } from "@/lib/datastore/resolve";
import { esGetMapping, esListIndices } from "@/lib/datastore/es";
import {
  listCollections,
  listDatabases,
  listIndexes,
  sampleFields,
} from "@/lib/datastore/mongo";
import { describeRdbError, getRdbDriver } from "@/lib/datastore/rdb-driver";
import { isRdbType, type DatastoreConnection } from "@/lib/datastore/types";

/**
 * POST /api/datastore/catalog → 目录浏览（只读）
 *
 * 入参 { connId, kind, ... }，kind 决定取什么：
 * - esIndices                       → 索引列表
 * - esMapping   { index }           → mapping 字段树
 * - mongoDatabases                  → 数据库列表
 * - mongoCollections { db }         → 集合列表
 * - mongoFields { db, collection }  → 采样推断的字段
 * - mongoIndexes { db, collection } → 集合索引
 * - rdbDatabases                    → 库列表
 * - rdbSchemas  { db }              → schema 列表（MySQL 折叠为与库同名的单元素）
 * - rdbTables   { db, schema }      → 表与视图列表
 * - rdbTable    { db, schema, table } → 某张表的列与索引
 *
 * 关系型一律按层懒加载：`information_schema` 在大库上很慢，一次性拉全量结构
 * 会让进入工具就卡住。列与索引只在展开某张表时才查。
 *
 * 目录操作一律只读，不经安全闸门（闸门只管查询台里的写与危险操作）。
 * 目标不可达时返回 { ok:false, error } 而非抛出，令前端能展示可读提示、页面不崩。
 */
interface CatalogBody {
  connId?: number;
  kind?: string;
  index?: string;
  db?: string;
  collection?: string;
  schema?: string;
  table?: string;
}

export async function POST(request: Request) {
  let body: CatalogBody;
  try {
    body = (await request.json()) as CatalogBody;
  } catch {
    return NextResponse.json({ ok: false, error: "请求体不是合法 JSON" }, { status: 400 });
  }

  let conn: DatastoreConnection;
  try {
    conn = resolveConnection(body.connId);
  } catch (err) {
    return NextResponse.json({ ok: false, error: msg(err, "连接不存在") });
  }

  try {
    switch (body.kind) {
      case "esIndices":
        return NextResponse.json({ ok: true, indices: await esListIndices(conn) });

      case "esMapping": {
        if (!body.index) throw new Error("缺少索引名");
        return NextResponse.json({ ok: true, fields: await esGetMapping(conn, body.index) });
      }

      case "mongoDatabases":
        return NextResponse.json({ ok: true, databases: await listDatabases(conn) });

      case "mongoCollections":
        return NextResponse.json({
          ok: true,
          collections: await listCollections(conn, requireDb(body)),
        });

      case "mongoFields": {
        const { db, collection } = requireCollection(body);
        return NextResponse.json({ ok: true, sample: await sampleFields(conn, db, collection) });
      }

      case "mongoIndexes": {
        const { db, collection } = requireCollection(body);
        return NextResponse.json({ ok: true, indexes: await listIndexes(conn, db, collection) });
      }

      case "rdbDatabases":
        return NextResponse.json({
          ok: true,
          databases: await rdbDriver(conn).listDatabases(conn),
        });

      case "rdbSchemas":
        return NextResponse.json({
          ok: true,
          schemas: await rdbDriver(conn).listSchemas(conn, requireDb(body)),
        });

      case "rdbTables": {
        const { db, schema } = requireSchema(body);
        return NextResponse.json({
          ok: true,
          tables: await rdbDriver(conn).listTables(conn, db, schema),
        });
      }

      case "rdbTable": {
        const { db, schema, table } = requireTable(body);
        return NextResponse.json({
          ok: true,
          detail: await rdbDriver(conn).describeTable(conn, db, schema, table),
        });
      }

      default:
        return NextResponse.json(
          { ok: false, error: `不支持的目录类型：${body.kind ?? "(空)"}` },
          { status: 400 }
        );
    }
  } catch (err) {
    return NextResponse.json({
      ok: false,
      error: isRdbType(conn.type) ? describeRdbError(conn.type, err) : msg(err, "读取失败"),
    });
  }
}

/** 取关系型驱动，顺带校验所选连接确实是关系型。 */
function rdbDriver(conn: DatastoreConnection) {
  if (!isRdbType(conn.type)) throw new Error("所选连接不是关系型数据源");
  return getRdbDriver(conn.type);
}

function msg(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

function requireDb(body: CatalogBody): string {
  if (!body.db) throw new Error("缺少数据库名");
  return body.db;
}

function requireCollection(body: CatalogBody): { db: string; collection: string } {
  if (!body.collection) throw new Error("缺少集合名");
  return { db: requireDb(body), collection: body.collection };
}

function requireSchema(body: CatalogBody): { db: string; schema: string } {
  if (!body.schema) throw new Error("缺少 schema 名");
  return { db: requireDb(body), schema: body.schema };
}

function requireTable(body: CatalogBody): { db: string; schema: string; table: string } {
  if (!body.table) throw new Error("缺少表名");
  return { ...requireSchema(body), table: body.table };
}
