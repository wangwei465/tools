/**
 * 服务端 MongoDB 客户端池（单例）。
 *
 * 与 `lib/redis/pool.ts` / `lib/db` 的 `globalThis.__appDb` 同构：以
 * `globalThis.__mongoPool` 维护 `Map<connId, MongoClient>`，规避 Next dev
 * 热重载导致的连接泄漏 / 句柄爆炸。`MongoClient` 自带连接池并复用空闲连接，
 * 本身就是设计来长期持有的对象，每请求新建会迅速耗尽句柄。
 *
 * ES 侧无状态（HTTP REST，每次 fetch 即可），不入池——故本文件只管 Mongo。
 */
import { MongoClient } from "mongodb";
import { parseExtra, type DatastoreConnection } from "./types";

/** 建连超时：宁可快速失败也不让请求长时间挂起。 */
const CONNECT_TIMEOUT_MS = 5000;

function poolMap(): Map<number, MongoClient> {
  const g = globalThis as unknown as { __mongoPool?: Map<number, MongoClient> };
  if (!g.__mongoPool) g.__mongoPool = new Map();
  return g.__mongoPool;
}

/**
 * 按连接配置构造客户端（不入池，不建连——驱动首次操作时懒连接）。
 * 用户名为空时不传 auth，交由连接串自带的凭证生效。
 */
export function buildMongoClient(
  conn: DatastoreConnection,
  timeoutMs = CONNECT_TIMEOUT_MS
): MongoClient {
  const extra = parseExtra(conn.extraJson);
  const auth = conn.username ? { username: conn.username, password: conn.password } : undefined;

  return new MongoClient(conn.uri, {
    ...(auth ? { auth } : {}),
    ...(extra.authDb ? { authSource: extra.authDb } : {}),
    serverSelectionTimeoutMS: timeoutMs,
    connectTimeoutMS: timeoutMs,
  });
}

/** 取（或懒建）池中客户端。 */
export function getMongoClient(conn: DatastoreConnection): MongoClient {
  const pool = poolMap();
  const existing = pool.get(conn.id);
  if (existing) return existing;
  const client = buildMongoClient(conn);
  pool.set(conn.id, client);
  return client;
}

/** 关闭并移除某连接在池中的客户端（连接配置编辑 / 删除时调用）。 */
export function dropMongoClient(id: number): void {
  const pool = poolMap();
  const client = pool.get(id);
  if (!client) return;
  pool.delete(id);
  // close 是异步的，但调用方无需等待——失败也只影响这一个陈旧客户端
  void client.close().catch(() => {
    /* 忽略断连异常 */
  });
}

/**
 * 客户端已失效的特征：驱动在建连失败后会自行关闭拓扑，
 * 此后该实例上的任何操作都只报「Topology is closed」，而不是真实原因。
 */
function isDeadClientError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : "";
  return /Topology is closed|MongoNotConnectedError|must be connected/i.test(message);
}

/**
 * 以池中客户端执行一次操作，客户端已失效时剔除并重建重试一次。
 *
 * 不做这层兜底的话，一次目标不可达就会让池里留下永久报「Topology is closed」的
 * 死客户端——目标恢复后仍连不上，且报错完全掩盖了真实原因。重试仅一次，
 * 失败即把真实错误抛给调用方。
 */
export async function withMongo<T>(
  conn: DatastoreConnection,
  run: (client: MongoClient) => Promise<T>
): Promise<T> {
  try {
    return await run(getMongoClient(conn));
  } catch (err) {
    if (!isDeadClientError(err)) throw err;
    dropMongoClient(conn.id);
    return run(getMongoClient(conn));
  }
}
