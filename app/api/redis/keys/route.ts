import { NextResponse } from "next/server";
import { resolveClient } from "@/lib/redis/resolve";
import { scanKeys } from "@/lib/redis/keyspace";

/**
 * POST /api/redis/keys → SCAN 分页浏览键空间（禁用 KEYS）
 * 入参 { connId, db?, match?, cursor?, count? }；cursor 空串表示从头。
 * db 为运行时选库（0-15，集群忽略）。
 * 返回 { ok, keys:[{key,type,ttl}], nextCursor }；nextCursor 空串表示遍历结束。
 */
export async function POST(request: Request) {
  let body: { connId?: number; db?: number; match?: string; cursor?: string; count?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "请求体不是合法 JSON" }, { status: 400 });
  }

  try {
    const { client } = resolveClient(Number(body.connId), Number(body.db));
    const count = Math.min(Math.max(Number(body.count) || 100, 10), 1000);
    const result = await scanKeys(client, body.match ?? "", body.cursor ?? "", count);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "扫描失败" },
      { status: 200 }
    );
  }
}
