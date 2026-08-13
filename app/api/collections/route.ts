import { NextResponse } from "next/server";
import { listNodes, createNode } from "@/lib/db";
import type { NodeType, RequestDraft } from "@/components/api-client/types";

/**
 * GET  /api/collections  → 全部节点（前端据 parentId 组装成树）
 * POST /api/collections  → 新建节点 { parentId, type, name, definition? }
 */
export async function GET() {
  return NextResponse.json({ ok: true, nodes: listNodes() });
}

export async function POST(request: Request) {
  let body: {
    parentId?: number | null;
    type?: NodeType;
    name?: string;
    definition?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "请求体不是合法 JSON" }, { status: 400 });
  }

  const type = body.type;
  const name = (body.name ?? "").trim();
  if (type !== "folder" && type !== "request") {
    return NextResponse.json({ ok: false, error: "无效的节点类型" }, { status: 400 });
  }
  if (!name) {
    return NextResponse.json({ ok: false, error: "名称不能为空" }, { status: 400 });
  }

  const node = createNode({
    parentId: body.parentId ?? null,
    type,
    name,
    definition: (body.definition ?? null) as RequestDraft | null,
  });
  return NextResponse.json({ ok: true, node });
}
