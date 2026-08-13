import { NextResponse } from "next/server";
import { resolveClient } from "@/lib/redis/resolve";
import { getInfo } from "@/lib/redis/info";

/**
 * POST /api/redis/info → INFO 监控（纯只读）
 * 入参 { connId }；集群对各主节点分别取 INFO 聚合返回。
 * 返回 { ok, nodes:[{ node, sections }] }。
 */
export async function POST(request: Request) {
  let body: { connId?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "请求体不是合法 JSON" }, { status: 400 });
  }

  try {
    const { client } = resolveClient(Number(body.connId));
    const result = await getInfo(client);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "获取 INFO 失败" },
      { status: 200 }
    );
  }
}
