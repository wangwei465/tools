/**
 * 服务端数据源连接池（单例）。
 *
 * 与 `lib/redis/pool.ts` / `lib/db` 的 `globalThis.__appDb` 同构：以
 * `globalThis.__mongoPool` / `globalThis.__rdbPool` 维护 `Map<connId, 客户端>`，
 * 规避 Next dev 热重载导致的连接泄漏 / 句柄爆炸。`MongoClient`、`mysql2` 的
 * `Pool` 与 `pg` 的 `Pool` 都自带连接池并复用空闲连接，本身就是设计来长期持有的
 * 对象，每请求新建会迅速耗尽句柄。
 *
 * ES 侧无状态（HTTP REST，每次 fetch 即可），不入池——故本文件只管 Mongo 与关系型。
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

/* ─── 关系型连接池 ────────────────────────────────────────── */

/**
 * 池中持有的关系型客户端。
 * `mysql2` 与 `pg` 的 Pool 形状不同，本文件只依赖「能关掉」这一点——
 * 池怎么建交给驱动侧，本文件只管持有、复用与失效重建（依赖倒置）。
 */
export interface RdbPoolLike {
  end(): Promise<unknown> | unknown;
}

function rdbPoolMap(): Map<number, RdbPoolLike> {
  const g = globalThis as unknown as { __rdbPool?: Map<number, RdbPoolLike> };
  if (!g.__rdbPool) g.__rdbPool = new Map();
  return g.__rdbPool;
}

/** 关闭并移除某连接在池中的关系型客户端（连接配置编辑 / 删除时调用）。 */
export function dropRdbPool(id: number): void {
  const pool = rdbPoolMap();
  const client = pool.get(id);
  if (!client) return;
  pool.delete(id);
  // end 可能是异步的，但调用方无需等待——失败也只影响这一个陈旧池
  void Promise.resolve()
    .then(() => client.end())
    .catch(() => {
      /* 忽略断连异常 */
    });
}

/**
 * 连接池已失效的特征：池被显式关闭后，其上的任何操作都只报「池已关闭」
 * 之类的话，而不是真实原因——与 Mongo 侧「Topology is closed」是同一个坑。
 */
function isDeadPoolError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : "";
  return /Pool is closed|after calling end on the pool|not queryable|Cannot enqueue|Connection lost/i.test(
    message
  );
}

/**
 * 以池中客户端执行一次操作，池已失效时剔除并重建重试一次。
 *
 * 与 `withMongo` 同构：不做这层兜底的话，一次目标不可达就可能让池里留下
 * 永久报错的死池——目标恢复后仍连不上，且报错完全掩盖了真实原因。
 * 重试仅一次，失败即把真实错误抛给调用方。
 *
 * 池的构造由 create 提供而非本文件内联：MySQL 与 PG 的建池参数差异大，
 * 塞进来会让本文件反过来依赖两个驱动。
 */
export async function withRdb<T, C extends RdbPoolLike>(
  conn: DatastoreConnection,
  create: () => C,
  run: (client: C) => Promise<T>
): Promise<T> {
  const get = (): C => {
    const pool = rdbPoolMap();
    const existing = pool.get(conn.id);
    if (existing) return existing as C;
    const client = create();
    pool.set(conn.id, client);
    return client;
  };

  try {
    return await run(get());
  } catch (err) {
    if (!isDeadPoolError(err)) throw err;
    dropRdbPool(conn.id);
    return run(get());
  }
}
