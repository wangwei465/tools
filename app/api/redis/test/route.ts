import { NextResponse } from "next/server";
import { testConnection } from "@/lib/redis/pool";
import type { RedisConnection, RedisConnectionInput } from "@/lib/redis/types";

/**
 * POST /api/redis/test → 连接测试（PING）
 * 入参为完整连接配置（可未保存），临时建连测试，不污染连接池。
 * 返回 { ok, latencyMs } 或 { ok:false, error }。
 */
export async function POST(request: Request) {
  let body: Partial<RedisConnectionInput>;
  try {
    body = (await request.json()) as Partial<RedisConnectionInput>;
  } catch {
    return NextResponse.json({ ok: false, error: "请求体不是合法 JSON" }, { status: 400 });
  }

  if (!body.nodes || body.nodes.length === 0) {
    return NextResponse.json({ ok: false, error: "至少需要一个节点" }, { status: 400 });
  }

  // 合成一个临时连接对象（id 仅占位，测试不入池）
  const conn: RedisConnection = {
    id: -1,
    name: body.name ?? "test",
    type: body.type ?? "standalone",
    nodes: body.nodes,
    masterName: body.masterName ?? "",
    password: body.password ?? "",
    db: body.db ?? 0,
    env: body.env ?? "local",
    mode: body.mode ?? "rw",
    createdAt: "",
    updatedAt: "",
  };

  const result = await testConnection(conn);
  return NextResponse.json(result);
}
