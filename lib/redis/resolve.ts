/**
 * 路由共享：由 connId（+ 可选运行时选库 db）解析出连接配置与池中客户端。
 * 抽出以避免各 route 重复 getRedisConnection + getClient。
 */
import { getRedisConnection } from "@/lib/db";
import { getClient, type RedisClient } from "./pool";
import type { RedisConnection } from "./types";

export function resolveClient(
  connId: number,
  db?: number
): { conn: RedisConnection; client: RedisClient } {
  if (!Number.isFinite(connId)) throw new Error("缺少有效的连接 ID");
  const conn = getRedisConnection(connId);
  if (!conn) throw new Error("连接不存在");
  // db 的合法化与集群恒 0 由 getClient/effectiveDb 内部兜底
  return { conn, client: getClient(conn, db) };
}

