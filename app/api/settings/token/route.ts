import { NextResponse } from "next/server";
import { getTokenConfig, setTokenConfig, type TokenConfig } from "@/lib/db";

/**
 * 统一令牌配置读写。
 *
 * GET  /api/settings/token  → 返回当前配置（无配置时返回默认值，token 为空）
 * POST /api/settings/token  → 保存配置 { headerName, prefix, token }
 *
 * 令牌只在服务端存取，前端读回后仅用于设置回显。
 */
export async function GET() {
  const config = getTokenConfig();
  return NextResponse.json(config);
}

export async function POST(request: Request) {
  let body: Partial<TokenConfig>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求体不是合法 JSON" }, { status: 400 });
  }

  if (typeof body.headerName !== "string" || body.headerName.trim() === "") {
    return NextResponse.json({ error: "headerName 不能为空" }, { status: 400 });
  }

  const config: TokenConfig = {
    headerName: body.headerName.trim(),
    prefix: typeof body.prefix === "string" ? body.prefix : "",
    token: typeof body.token === "string" ? body.token : "",
  };

  setTokenConfig(config);
  return NextResponse.json({ ok: true });
}
