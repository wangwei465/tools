import { NextResponse } from "next/server";
import {
  listRedisConnections,
  createRedisConnection,
  updateRedisConnection,
  deleteRedisConnection,
} from "@/lib/db";
import { dropClient } from "@/lib/redis/pool";
import type { RedisConnectionInput } from "@/lib/redis/types";

/**
 * GET    /api/redis/connections  → 连接列表
 * POST   /api/redis/connections  → 新建 { ...RedisConnectionInput }
 * PATCH  /api/redis/connections  → 编辑 { id, ...RedisConnectionInput }；变更后销毁旧连接
 * DELETE /api/redis/connections  → 删除 { id }；同时销毁池中连接
 */
export async function GET() {
  return NextResponse.json({ ok: true, connections: listRedisConnections() });
}

export async function POST(request: Request) {
  const body = await parseBody(request);
  if (!body) return badJson();
  try {
    const connection = createRedisConnection(body as unknown as RedisConnectionInput);
    return NextResponse.json({ ok: true, connection });
  } catch (err) {
    return NextResponse.json({ ok: false, error: msg(err) }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  const body = (await parseBody(request)) as (RedisConnectionInput & { id?: number }) | null;
  if (!body) return badJson();
  const id = Number(body.id);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ ok: false, error: "缺少连接 ID" }, { status: 400 });
  }
  try {
    const connection = updateRedisConnection(id, body);
    dropClient(id); // 配置已变，销毁旧连接，下次按新配置重建
    return NextResponse.json({ ok: true, connection });
  } catch (err) {
    return NextResponse.json({ ok: false, error: msg(err) }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  const body = (await parseBody(request)) as { id?: number } | null;
  if (!body) return badJson();
  const id = Number(body.id);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ ok: false, error: "缺少连接 ID" }, { status: 400 });
  }
  deleteRedisConnection(id);
  dropClient(id);
  return NextResponse.json({ ok: true });
}

async function parseBody(request: Request): Promise<Record<string, unknown> | null> {
  try {
    return (await request.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}
function badJson() {
  return NextResponse.json({ ok: false, error: "请求体不是合法 JSON" }, { status: 400 });
}
function msg(err: unknown): string {
  return err instanceof Error ? err.message : "操作失败";
}
