import { NextResponse } from "next/server";
import { updateDatastoreConnection, deleteDatastoreConnection } from "@/lib/db";
import { dropMongoClient, dropRdbPool } from "@/lib/datastore/pool";
import type { DatastoreConnectionInput } from "@/lib/datastore/types";

/**
 * PATCH  /api/datastore/connections/{id} → 编辑
 * DELETE /api/datastore/connections/{id} → 删除
 *
 * 两者都释放池中对应的 MongoClient 与关系型连接池：配置已变或连接已删，
 * 陈旧客户端不能再被复用（ES 无状态不入池，无需释放）。
 * 不按类型分支：改类型时旧类型的池同样要放掉，无脑两个都 drop 最省心且无副作用。
 */
interface RouteContext {
  params: { id: string };
}

function parseId(context: RouteContext): number | null {
  const id = Number(context.params.id);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** 释放该连接在服务端持有的一切客户端。 */
function releaseClients(id: number): void {
  dropMongoClient(id);
  dropRdbPool(id);
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
    releaseClients(id); // 配置已变，销毁旧客户端，下次按新配置重建
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
  releaseClients(id);
  return NextResponse.json({ ok: true });
}
