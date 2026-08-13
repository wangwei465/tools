import { NextResponse } from "next/server";
import { listVariables, createVariable } from "@/lib/db";

/**
 * GET  /api/variables  → 全部变量（前端按 envId 分组：null = 全局）
 * POST /api/variables  → 新建变量 { envId, key, value, enabled }（允许空 key 先占位）
 */
export async function GET() {
  return NextResponse.json({ ok: true, variables: listVariables() });
}

export async function POST(request: Request) {
  let body: { envId?: number | null; key?: string; value?: string; enabled?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "请求体不是合法 JSON" }, { status: 400 });
  }
  const variable = createVariable({
    envId: body.envId ?? null,
    key: body.key ?? "",
    value: body.value ?? "",
    enabled: body.enabled,
  });
  return NextResponse.json({ ok: true, variable });
}
