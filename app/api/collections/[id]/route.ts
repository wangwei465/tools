import { NextResponse } from "next/server";
import { renameNode, updateNodeDefinition, moveNode, deleteNodeCascade } from "@/lib/db";
import type { RequestDraft } from "@/components/api-client/types";

interface Ctx {
  params: { id: string };
}

/**
 * PATCH  /api/collections/[id]  → 按字段执行：重命名 name / 更新 definition / 移动 move{parentId,sortOrder}
 * DELETE /api/collections/[id]  → 删除节点（folder 级联删子树）
 */
export async function PATCH(request: Request, { params }: Ctx) {
  const id = Number(params.id);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ ok: false, error: "无效 ID" }, { status: 400 });
  }

  let body: {
    name?: string;
    definition?: unknown;
    move?: { parentId?: number | null; sortOrder?: number };
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "请求体不是合法 JSON" }, { status: 400 });
  }

  if (typeof body.name === "string") {
    const name = body.name.trim();
    if (!name) return NextResponse.json({ ok: false, error: "名称不能为空" }, { status: 400 });
    renameNode(id, name);
  }
  if (body.definition !== undefined) {
    updateNodeDefinition(id, body.definition as RequestDraft);
  }
  if (body.move !== undefined) {
    moveNode(id, body.move.parentId ?? null, Number(body.move.sortOrder) || 0);
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, { params }: Ctx) {
  const id = Number(params.id);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ ok: false, error: "无效 ID" }, { status: 400 });
  }
  deleteNodeCascade(id);
  return NextResponse.json({ ok: true });
}
