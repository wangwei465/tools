/**
 * 类型化值的读取与写入。
 *
 * 读：按 TYPE 分派，集合类带元素上限截断（保护前端不被超大 value 拖垮）。
 * 写：按 action 分派子命令；只读拦截在路由层完成，此处只负责执行。
 *
 * 统一用 `client.call()` 执行，避免 Redis | Cluster 联合类型的方法解析问题，
 * 集群下命令按键槽位自动路由。
 */
import type { RedisClient } from "./pool";
import type { FieldEntry, RedisKeyType, ValueResult, ZMember } from "./types";

/** 集合类元素读取上限：超出仅取前 N 并标记截断。 */
export const MAX_ELEMENTS = 500;

/** call 的薄封装：参数收敛为命令可接受的标量。 */
function call(client: RedisClient, cmd: string, ...args: (string | number)[]): Promise<unknown> {
  return client.call(cmd, ...args) as Promise<unknown>;
}

/** 读取 key 的类型化值，带 TTL 与截断信息。 */
export async function readValue(client: RedisClient, key: string): Promise<ValueResult> {
  const type = (await call(client, "TYPE", key)) as RedisKeyType;
  const ttl = Number(await call(client, "TTL", key));

  if (type === "none") {
    return { type, value: null, ttl, total: 0, truncated: false };
  }

  if (type === "string") {
    const value = (await call(client, "GET", key)) as string | null;
    return { type, value: value ?? "", ttl, total: 0, truncated: false };
  }

  if (type === "list") {
    const total = Number(await call(client, "LLEN", key));
    const value = (await call(client, "LRANGE", key, 0, MAX_ELEMENTS - 1)) as string[];
    return { type, value, ttl, total, truncated: total > MAX_ELEMENTS };
  }

  if (type === "set") {
    const total = Number(await call(client, "SCARD", key));
    const value =
      total <= MAX_ELEMENTS
        ? ((await call(client, "SMEMBERS", key)) as string[])
        : await boundedScan(client, "SSCAN", key);
    return { type, value, ttl, total, truncated: total > MAX_ELEMENTS };
  }

  if (type === "zset") {
    const total = Number(await call(client, "ZCARD", key));
    const flat = (await call(
      client,
      "ZRANGE",
      key,
      0,
      MAX_ELEMENTS - 1,
      "WITHSCORES"
    )) as string[];
    const value: ZMember[] = [];
    for (let i = 0; i < flat.length; i += 2) {
      value.push({ member: flat[i], score: Number(flat[i + 1]) });
    }
    return { type, value, ttl, total, truncated: total > MAX_ELEMENTS };
  }

  if (type === "hash") {
    const total = Number(await call(client, "HLEN", key));
    // 注意：call("HGETALL") 返回 RESP 扁平数组 [field, value, ...]，
    // 而非 .hgetall() 的对象；与 HSCAN 一致按配对解析。
    const flat =
      total <= MAX_ELEMENTS
        ? ((await call(client, "HGETALL", key)) as string[])
        : await boundedScan(client, "HSCAN", key);
    const value: FieldEntry[] = [];
    for (let i = 0; i < flat.length; i += 2) {
      value.push({ field: flat[i], value: flat[i + 1] });
    }
    return { type, value, ttl, total, truncated: total > MAX_ELEMENTS };
  }

  // stream 等类型：仅展示类型与 TTL，值不展开（超出本工具范围）
  return { type, value: null, ttl, total: 0, truncated: false };
}

/**
 * 有界 SSCAN / HSCAN：循环游标直到收集满上限或遍历完，避免一次性拉取超大集合。
 * HSCAN 返回 [field, value, ...] 扁平数组；SSCAN 返回 [member, ...]。
 */
async function boundedScan(
  client: RedisClient,
  cmd: "SSCAN" | "HSCAN",
  key: string
): Promise<string[]> {
  const collected: string[] = [];
  let cursor = "0";
  const limit = cmd === "HSCAN" ? MAX_ELEMENTS * 2 : MAX_ELEMENTS;
  do {
    const [next, batch] = (await call(client, cmd, key, cursor, "COUNT", 200)) as [string, string[]];
    collected.push(...batch);
    cursor = next;
  } while (cursor !== "0" && collected.length < limit);
  return collected.slice(0, limit);
}

/** 写操作的动作枚举。 */
export type ValueWriteAction =
  | "set"
  | "hset"
  | "hdel"
  | "lpush"
  | "rpush"
  | "lpop"
  | "rpop"
  | "lset"
  | "sadd"
  | "srem"
  | "zadd"
  | "zrem"
  | "expire"
  | "persist"
  | "del";

/** 写操作入参（按 action 取用不同字段）。 */
export interface ValueWritePayload {
  action: ValueWriteAction;
  key: string;
  field?: string;
  value?: string;
  member?: string;
  score?: number;
  index?: number;
  seconds?: number;
}

/** 执行一次值写操作，返回 Redis 原始结果。 */
export async function applyValueWrite(
  client: RedisClient,
  p: ValueWritePayload
): Promise<unknown> {
  const { key } = p;
  switch (p.action) {
    case "set":
      return call(client, "SET", key, p.value ?? "");
    case "hset":
      return call(client, "HSET", key, p.field ?? "", p.value ?? "");
    case "hdel":
      return call(client, "HDEL", key, p.field ?? "");
    case "lpush":
      return call(client, "LPUSH", key, p.value ?? "");
    case "rpush":
      return call(client, "RPUSH", key, p.value ?? "");
    case "lpop":
      return call(client, "LPOP", key);
    case "rpop":
      return call(client, "RPOP", key);
    case "lset":
      return call(client, "LSET", key, p.index ?? 0, p.value ?? "");
    case "sadd":
      return call(client, "SADD", key, p.member ?? "");
    case "srem":
      return call(client, "SREM", key, p.member ?? "");
    case "zadd":
      return call(client, "ZADD", key, p.score ?? 0, p.member ?? "");
    case "zrem":
      return call(client, "ZREM", key, p.member ?? "");
    case "expire":
      return call(client, "EXPIRE", key, p.seconds ?? 0);
    case "persist":
      return call(client, "PERSIST", key);
    case "del":
      return call(client, "DEL", key);
    default:
      throw new Error(`不支持的写操作：${(p as ValueWritePayload).action}`);
  }
}
