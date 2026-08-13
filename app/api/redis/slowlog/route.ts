import { NextResponse } from "next/server";
import { resolveClient } from "@/lib/redis/resolve";
import { DEFAULT_SLOWLOG_COUNT, getSlowlog, resetSlowlog } from "@/lib/redis/slowlog";
import { isDangerousCommand } from "@/lib/redis/safety";

/**
 * POST /api/redis/slowlog → 慢查询日志查看 / 清空
 * 入参 { connId, action:"get"|"reset", count?, confirm? }。
 *
 * - get：纯只读拉取（SLOWLOG LEN + GET <count 默认 128>），集群按主节点聚合为 NodeSlowlog[]。
 * - reset：危险操作，与命令行 exec 一致的闸门——
 *     只读模式拦截（blocked:"readonly"）；未 confirm 返回 needConfirm + 连接名/环境；
 *     确认后逐主节点 SLOWLOG RESET。
 * 错误按既有信封 { ok:false, error } 返回，不抛未捕获异常。
 */
export async function POST(request: Request) {
  let body: { connId?: number; action?: "get" | "reset"; count?: number; confirm?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "请求体不是合法 JSON" }, { status: 400 });
  }

  let conn, client;
  try {
    ({ conn, client } = resolveClient(Number(body.connId)));
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "连接不存在" },
      { status: 200 }
    );
  }

  const action = body.action ?? "get";

  // 清空：危险操作闸门（只读拦截 + 二次确认），复用 safety 判定与 exec 同款信封
  if (action === "reset") {
    if (conn.mode === "readonly") {
      return NextResponse.json(
        {
          ok: false,
          blocked: "readonly",
          error: `当前连接「${conn.name}」为只读模式，禁止清空慢查询日志`,
        },
        { status: 200 }
      );
    }
    if (isDangerousCommand("slowlog reset") && !body.confirm) {
      return NextResponse.json(
        {
          ok: false,
          needConfirm: true,
          error: `清空慢查询日志是危险操作，确认在「${conn.name}」（${conn.env}）执行 SLOWLOG RESET？`,
          connName: conn.name,
          env: conn.env,
        },
        { status: 200 }
      );
    }
    try {
      await resetSlowlog(client);
      return NextResponse.json({ ok: true });
    } catch (err) {
      return NextResponse.json(
        { ok: false, error: err instanceof Error ? err.message : "清空慢查询失败" },
        { status: 200 }
      );
    }
  }

  // 拉取：纯只读，任何模式均可查看
  try {
    const count = Math.min(Math.max(Number(body.count) || DEFAULT_SLOWLOG_COUNT, 1), 1024);
    const nodes = await getSlowlog(client, count);
    return NextResponse.json({ ok: true, nodes });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "获取慢查询失败" },
      { status: 200 }
    );
  }
}
