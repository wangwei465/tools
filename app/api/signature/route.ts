import { NextResponse } from "next/server";
import { createHash } from "node:crypto";

/**
 * 生成签名：md5(timestamp + appId + appSecret) 转小写。
 *
 * POST /api/signature  body { timestamp, appId, appSecret }
 *   成功 → { ok: true, signature }
 *   失败 → { ok: false, error }
 *
 * 为何在服务端算：浏览器 Web Crypto (SubtleCrypto) 不支持 MD5，
 * 服务端用 Node 内置 crypto 计算可零依赖且保证算法正确。
 * appSecret 仅用于本次计算，不落库、不记录。
 */
export async function POST(request: Request) {
  let body: { timestamp?: unknown; appId?: unknown; appSecret?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "请求体不是合法 JSON" }, { status: 400 });
  }

  const timestamp = String(body.timestamp ?? "").trim();
  const appId = String(body.appId ?? "").trim();
  const appSecret = String(body.appSecret ?? "").trim();

  if (!timestamp || !appId || !appSecret) {
    return NextResponse.json(
      { ok: false, error: "时间戳、appId、appSecret 均不能为空" },
      { status: 400 }
    );
  }

  // 拼接顺序即签名规则：时间戳 + appId + appSecret
  const raw = `${timestamp}${appId}${appSecret}`;
  const signature = createHash("md5").update(raw, "utf8").digest("hex").toLowerCase();

  return NextResponse.json({ ok: true, signature });
}
