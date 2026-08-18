import { NextResponse } from "next/server";
import { resolveConnection } from "@/lib/datastore/resolve";
import { esGetMapping, esListIndices } from "@/lib/datastore/es";
import {
  listCollections,
  listDatabases,
  listIndexes,
  sampleFields,
} from "@/lib/datastore/mongo";

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
}

export async function POST(request: Request) {
  let body: CatalogBody;
  try {
    body = (await request.json()) as CatalogBody;
  } catch {
    return NextResponse.json({ ok: false, error: "请求体不是合法 JSON" }, { status: 400 });
  }

  try {
    const conn = resolveConnection(body.connId);

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

      default:
        return NextResponse.json(
          { ok: false, error: `不支持的目录类型：${body.kind ?? "(空)"}` },
          { status: 400 }
        );
    }
  } catch (err) {
    return NextResponse.json({
      ok: false,
      error: err instanceof Error ? err.message : "读取失败",
    });
  }
}

function requireDb(body: CatalogBody): string {
  if (!body.db) throw new Error("缺少数据库名");
  return body.db;
}

function requireCollection(body: CatalogBody): { db: string; collection: string } {
  if (!body.collection) throw new Error("缺少集合名");
  return { db: requireDb(body), collection: body.collection };
}
