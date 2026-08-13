import { NextResponse } from "next/server";
import { listEnvironments, createEnvironment, setActiveEnvironment } from "@/lib/db";

/**
 * GET   /api/environments  → 环境列表（含激活标记）
 * POST  /api/environments  → 新建环境 { name }
 * PATCH /api/environments  → 设置激活环境 { activeId: number | null }（null = 无环境）
 */
export async function GET() {
  return NextResponse.json({ ok: true, environments: listEnvironments() });
}

export async function POST(request: Request) {
  let body: { name?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "请求体不是合法 JSON" }, { status: 400 });
  }
  const name = (body.name ?? "").trim();
  if (!name) {
    return NextResponse.json({ ok: false, error: "名称不能为空" }, { status: 400 });
  }
  return NextResponse.json({ ok: true, environment: createEnvironment(name) });
}

export async function PATCH(request: Request) {
  let body: { activeId?: number | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "请求体不是合法 JSON" }, { status: 400 });
  }
  const raw = body.activeId;
  setActiveEnvironment(raw == null ? null : Number(raw));
  return NextResponse.json({ ok: true });
}
