import { NextResponse } from "next/server";
import { resolveClient } from "@/lib/redis/resolve";
import { readValue, applyValueWrite, type ValueWritePayload } from "@/lib/redis/value";

/**
 * POST /api/redis/value
 * 读：{ connId, db?, action:"get", key } → { ok, type, value, ttl, total, truncated }
 * 写：{ connId, db?, action:"set|hset|...|del|expire|persist", key, ... } → { ok, result }
 *
 * db 为运行时选库（0-15，集群忽略）。只读模式拦截一切写操作（action !== "get"）。
 */
export async function POST(request: Request) {
  let body:
    | (ValueWritePayload & { connId?: number; db?: number })
    | { connId?: number; db?: number; action: "get"; key: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "请求体不是合法 JSON" }, { status: 400 });
  }

  const action = (body as { action?: string }).action;
  const key = (body as { key?: string }).key;
  if (!action || typeof key !== "string") {
    return NextResponse.json({ ok: false, error: "缺少 action 或 key" }, { status: 400 });
  }

  try {
    const { conn, client } = resolveClient(Number(body.connId), Number((body as { db?: number }).db));

    // 读取
    if (action === "get") {
      const result = await readValue(client, key);
      return NextResponse.json({ ok: true, ...result });
    }

    // 写入：只读模式拦截
    if (conn.mode === "readonly") {
      return NextResponse.json(
        { ok: false, error: "当前连接为只读模式，请切换到读写模式后再操作", blocked: "readonly" },
        { status: 200 }
      );
    }

    const result = await applyValueWrite(client, body as ValueWritePayload);
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "操作失败" },
      { status: 200 }
    );
  }
}
