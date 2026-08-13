import { NextResponse } from "next/server";
import { renameEnvironment, deleteEnvironment } from "@/lib/db";

interface Ctx {
  params: { id: string };
}

/**
 * PATCH  /api/environments/[id]  → 重命名 { name }
 * DELETE /api/environments/[id]  → 删除环境（级联其环境级变量）
 */
export async function PATCH(request: Request, { params }: Ctx) {
  const id = Number(params.id);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ ok: false, error: "无效 ID" }, { status: 400 });
  }
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
  renameEnvironment(id, name);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, { params }: Ctx) {
  const id = Number(params.id);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ ok: false, error: "无效 ID" }, { status: 400 });
  }
  deleteEnvironment(id);
  return NextResponse.json({ ok: true });
}
