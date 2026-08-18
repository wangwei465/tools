import { NextResponse } from "next/server";
import { listDatastoreConnections, createDatastoreConnection } from "@/lib/db";
import type { DatastoreConnectionInput } from "@/lib/datastore/types";

/**
 * GET  /api/datastore/connections → 连接列表（凭证已脱敏）
 * POST /api/datastore/connections → 新建 { ...DatastoreConnectionInput }
 *
 * 单条的编辑 / 删除见 [id]/route.ts。
 */
export async function GET() {
  return NextResponse.json({ ok: true, connections: listDatastoreConnections() });
}

export async function POST(request: Request) {
  let body: DatastoreConnectionInput;
  try {
    body = (await request.json()) as DatastoreConnectionInput;
  } catch {
    return NextResponse.json({ ok: false, error: "请求体不是合法 JSON" }, { status: 400 });
  }

  try {
    const connection = createDatastoreConnection(body);
    return NextResponse.json({ ok: true, connection });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "创建失败" },
      { status: 400 }
    );
  }
}
