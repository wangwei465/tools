import { NextResponse } from "next/server";
import { getTimeoutMs, setTimeoutMs } from "@/lib/db";

/**
 * 请求超时配置读写。
 *
 * GET  /api/settings/timeout  → { timeoutMs }（无配置时返回默认 30 分钟）
 * POST /api/settings/timeout  → 保存 { timeoutMs }，需为正数（毫秒）
 *
 * 超时值以毫秒存取；前端负责「分钟↔毫秒」的展示转换。
 * 保存后由代理在下次请求时读取，无需重启服务。
 */
export async function GET() {
  return NextResponse.json({ timeoutMs: getTimeoutMs() });
}

export async function POST(request: Request) {
  let body: { timeoutMs?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求体不是合法 JSON" }, { status: 400 });
  }

  const ms = Number(body.timeoutMs);
  if (!Number.isFinite(ms) || ms <= 0) {
    return NextResponse.json({ error: "超时时间必须是正数（毫秒）" }, { status: 400 });
  }

  setTimeoutMs(ms);
  return NextResponse.json({ ok: true });
}
