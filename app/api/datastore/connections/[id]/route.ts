import { NextResponse } from "next/server";
import { updateDatastoreConnection, deleteDatastoreConnection } from "@/lib/db";
import { dropMongoClient } from "@/lib/datastore/pool";
import type { DatastoreConnectionInput } from "@/lib/datastore/types";

/**
 * PATCH  /api/datastore/connections/{id} → 编辑
 * DELETE /api/datastore/connections/{id} → 删除
 *
 * 两者都释放池中对应的 MongoClient：配置已变或连接已删，陈旧客户端不能再被复用
 * （ES 无状态不入池，无需释放）。
 */
interface RouteContext {
  params: { id: string };
}

function parseId(context: RouteContext): number | null {
  const id = Number(context.params.id);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function PATCH(request: Request, context: RouteContext) {
  const id = parseId(context);
  if (id == null) {
    return NextResponse.json({ ok: false, error: "连接 ID 非法" }, { status: 400 });
  }

  let body: DatastoreConnectionInput;
  try {
    body = (await request.json()) as DatastoreConnectionInput;
  } catch {
    return NextResponse.json({ ok: false, error: "请求体不是合法 JSON" }, { status: 400 });
  }

  try {
    const connection = updateDatastoreConnection(id, body);
    dropMongoClient(id); // 配置已变，销毁旧客户端，下次按新配置重建
    return NextResponse.json({ ok: true, connection });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "保存失败" },
      { status: 400 }
    );
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const id = parseId(context);
  if (id == null) {
    return NextResponse.json({ ok: false, error: "连接 ID 非法" }, { status: 400 });
  }
  deleteDatastoreConnection(id);
  dropMongoClient(id);
  return NextResponse.json({ ok: true });
}
