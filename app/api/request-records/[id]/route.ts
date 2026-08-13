import { NextResponse } from "next/server";
import { deleteRecord, updateRecord } from "@/lib/db";

interface Ctx {
  params: { id: string };
}

/**
 * PATCH /api/request-records/[id]  → 编辑记录
 * DELETE /api/request-records/[id] → 删除记录
 */
export async function PATCH(request: Request, { params }: Ctx) {
  const id = Number(params.id);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ ok: false, error: "无效 ID" }, { status: 400 });
  }

  let body: { name?: string; url?: string; headers?: Record<string, string> };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "请求体不是合法 JSON" }, { status: 400 });
  }

  try {
    updateRecord(id, body);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "更新失败";
    return NextResponse.json({ ok: false, error: msg }, { status: 409 });
  }
}

export async function DELETE(_request: Request, { params }: Ctx) {
  const id = Number(params.id);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ ok: false, error: "无效 ID" }, { status: 400 });
  }
  deleteRecord(id);
  return NextResponse.json({ ok: true });
}
