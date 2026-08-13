import { NextResponse } from "next/server";
import { deleteHistory } from "@/lib/db";

interface Ctx {
  params: { id: string };
}

/** DELETE /api/history/[id] → 删除单条历史 */
export async function DELETE(_request: Request, { params }: Ctx) {
  const id = Number(params.id);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ ok: false, error: "无效 ID" }, { status: 400 });
  }
  deleteHistory(id);
  return NextResponse.json({ ok: true });
}
