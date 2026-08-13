import { NextResponse } from "next/server";
import { updateVariable, deleteVariable } from "@/lib/db";

interface Ctx {
  params: { id: string };
}

/**
 * PATCH  /api/variables/[id]  → 更新 { key?, value?, enabled? }
 * DELETE /api/variables/[id]  → 删除变量
 */
export async function PATCH(request: Request, { params }: Ctx) {
  const id = Number(params.id);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ ok: false, error: "无效 ID" }, { status: 400 });
  }
  let body: { key?: string; value?: string; enabled?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "请求体不是合法 JSON" }, { status: 400 });
  }
  updateVariable(id, { key: body.key, value: body.value, enabled: body.enabled });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, { params }: Ctx) {
  const id = Number(params.id);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ ok: false, error: "无效 ID" }, { status: 400 });
  }
  deleteVariable(id);
  return NextResponse.json({ ok: true });
}
