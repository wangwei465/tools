import { NextResponse } from "next/server";
import { resolveClient } from "@/lib/redis/resolve";
import { commandName, isDangerousCommand, isWriteCommand } from "@/lib/redis/safety";

/**
 * POST /api/redis/exec → redis-cli 式原始命令执行
 * 入参 { connId, db?, command, confirm? }；db 为运行时选库（0-15，集群忽略）。
 *
 * 安全闸门（服务端硬编码判定，不信任前端）：
 * - 只读模式 + 写命令 → 拦截（blocked:"readonly"）
 * - 危险命令 + 未确认 → 要求二次确认（needConfirm:true，回传连接名与环境）
 * 命令执行错误原样回显（ok:false, error），不视为服务异常。
 */
export async function POST(request: Request) {
  let body: { connId?: number; db?: number; command?: string; confirm?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "请求体不是合法 JSON" }, { status: 400 });
  }

  const raw = (body.command ?? "").trim();
  if (!raw) {
    return NextResponse.json({ ok: false, error: "命令不能为空" }, { status: 400 });
  }

  let conn, client;
  try {
    ({ conn, client } = resolveClient(Number(body.connId), Number(body.db)));
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "连接不存在" },
      { status: 200 }
    );
  }

  const tokens = tokenize(raw);
  const name = commandName(tokens[0] ?? "");

  // 闸门 1：只读模式拦截写命令（传完整命令串，令 SLOWLOG 等复合命令按子命令判定）
  if (conn.mode === "readonly" && isWriteCommand(raw)) {
    return NextResponse.json(
      {
        ok: false,
        blocked: "readonly",
        error: `当前连接「${conn.name}」为只读模式，禁止执行写命令 ${name.toUpperCase()}`,
      },
      { status: 200 }
    );
  }

  // 闸门 2：危险命令二次确认
  if (isDangerousCommand(raw) && !body.confirm) {
    return NextResponse.json(
      {
        ok: false,
        needConfirm: true,
        error: `${name.toUpperCase()} 是危险命令，确认在「${conn.name}」（${conn.env}）执行？`,
        connName: conn.name,
        env: conn.env,
      },
      { status: 200 }
    );
  }

  // 执行
  try {
    const result = await client.call(tokens[0], ...tokens.slice(1));
    return NextResponse.json({ ok: true, result: normalize(result) });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "命令执行失败" },
      { status: 200 }
    );
  }
}

/**
 * 简易命令分词：支持双引号 / 单引号包裹含空格的参数。
 * 未闭合引号按普通空白切分处理。
 */
function tokenize(input: string): string[] {
  const tokens: string[] = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(input)) !== null) {
    tokens.push(m[1] ?? m[2] ?? m[3] ?? "");
  }
  return tokens;
}

/**
 * 将 Redis 回复规整为 JSON 可序列化的展示值。
 * ioredis 默认返回 string/number/null/嵌套数组；Buffer 兜底转字符串。
 */
function normalize(reply: unknown): unknown {
  if (reply === null || reply === undefined) return null;
  if (Buffer.isBuffer(reply)) return reply.toString("utf-8");
  if (Array.isArray(reply)) return reply.map(normalize);
  return reply;
}
