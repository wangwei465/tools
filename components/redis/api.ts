"use client";

/**
 * Redis 管理·前端 API 封装。
 * 统一 POST JSON 信封，返回 { ok, ... } 或 { ok:false, error }。
 * 类型复用 lib/redis/types（纯数据类型，无服务端依赖）。
 */
import type {
  RedisConnection,
  RedisConnectionInput,
  KeyInfo,
  ValueResult,
  NodeInfo,
  NodeSlowlog,
} from "@/lib/redis/types";
import type { ValueWriteAction } from "@/lib/redis/value";

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return (await res.json()) as T;
}

async function req<T>(url: string, method: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return (await res.json()) as T;
}

/** 写值入参（前端视角，与后端 ValueWritePayload 对齐）。 */
export interface WriteValueInput {
  action: ValueWriteAction;
  key: string;
  field?: string;
  value?: string;
  member?: string;
  score?: number;
  index?: number;
  seconds?: number;
}

export const redisApi = {
  async listConnections(): Promise<RedisConnection[]> {
    const r = await fetch("/api/redis/connections").then((x) => x.json());
    return r.ok ? (r.connections as RedisConnection[]) : [];
  },

  createConnection(input: RedisConnectionInput) {
    return post<{ ok: boolean; connection?: RedisConnection; error?: string }>(
      "/api/redis/connections",
      input
    );
  },

  updateConnection(id: number, input: RedisConnectionInput) {
    return req<{ ok: boolean; connection?: RedisConnection; error?: string }>(
      "/api/redis/connections",
      "PATCH",
      { id, ...input }
    );
  },

  deleteConnection(id: number) {
    return req<{ ok: boolean; error?: string }>("/api/redis/connections", "DELETE", { id });
  },

  testConnection(input: RedisConnectionInput) {
    return post<{ ok: boolean; latencyMs?: number; error?: string }>("/api/redis/test", input);
  },

  scanKeys(connId: number, db: number, match: string, cursor: string, count?: number) {
    return post<{ ok: boolean; keys?: KeyInfo[]; nextCursor?: string; error?: string }>(
      "/api/redis/keys",
      { connId, db, match, cursor, count }
    );
  },

  getValue(connId: number, db: number, key: string) {
    return post<{ ok: boolean; error?: string } & Partial<ValueResult>>("/api/redis/value", {
      connId,
      db,
      action: "get",
      key,
    });
  },

  writeValue(connId: number, db: number, input: WriteValueInput) {
    return post<{ ok: boolean; result?: unknown; error?: string; blocked?: string }>(
      "/api/redis/value",
      { connId, db, ...input }
    );
  },

  exec(connId: number, db: number, command: string, confirm?: boolean) {
    return post<{
      ok: boolean;
      result?: unknown;
      error?: string;
      needConfirm?: boolean;
      blocked?: string;
      connName?: string;
      env?: string;
    }>("/api/redis/exec", { connId, db, command, confirm });
  },

  getInfo(connId: number) {
    return post<{ ok: boolean; nodes?: NodeInfo[]; error?: string }>("/api/redis/info", { connId });
  },

  getSlowlog(connId: number, count?: number) {
    return post<{ ok: boolean; nodes?: NodeSlowlog[]; error?: string }>("/api/redis/slowlog", {
      connId,
      action: "get",
      count,
    });
  },

  resetSlowlog(connId: number, confirm?: boolean) {
    return post<{
      ok: boolean;
      error?: string;
      needConfirm?: boolean;
      blocked?: string;
      connName?: string;
      env?: string;
    }>("/api/redis/slowlog", { connId, action: "reset", confirm });
  },
};
