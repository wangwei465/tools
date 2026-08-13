import { NextResponse } from "next/server";
import { listHistory, appendHistory, clearHistory } from "@/lib/db";
import type { RequestDraft } from "@/components/api-client/types";

/**
 * GET    /api/history  → 倒序历史列表
 * POST   /api/history  → 追加一条 { nodeId?, snapshot, status, timeMs, size }
 * DELETE /api/history  → 清空历史
 */
export async function GET() {
  return NextResponse.json({ ok: true, history: listHistory() });
}

export async function POST(request: Request) {
  let body: {
    nodeId?: number | null;
    snapshot?: unknown;
    status?: number;
    timeMs?: number;
    size?: number;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "请求体不是合法 JSON" }, { status: 400 });
  }

  if (!body.snapshot) {
    return NextResponse.json({ ok: false, error: "缺少请求快照" }, { status: 400 });
  }

  const entry = appendHistory({
    nodeId: body.nodeId ?? null,
    snapshot: body.snapshot as RequestDraft,
    status: Number(body.status) || 0,
    timeMs: Number(body.timeMs) || 0,
    size: Number(body.size) || 0,
  });
  return NextResponse.json({ ok: true, entry });
}

export async function DELETE() {
  clearHistory();
  return NextResponse.json({ ok: true });
}
