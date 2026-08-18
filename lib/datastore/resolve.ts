/**
 * 路由共享：由 connId 解析出连接配置。
 * 抽出以避免 catalog / query 各 route 重复 getDatastoreConnection + 空值校验。
 */
import { getDatastoreConnection } from "@/lib/db";
import type { DatastoreConnection } from "./types";

export function resolveConnection(connId: unknown): DatastoreConnection {
  const id = Number(connId);
  if (!Number.isFinite(id)) throw new Error("缺少有效的连接 ID");
  const conn = getDatastoreConnection(id);
  if (!conn) throw new Error("连接不存在");
  return conn;
}
