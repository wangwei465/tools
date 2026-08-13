/**
 * 服务端 Redis 连接池（单例）。
 *
 * 与 `lib/db` 的 `globalThis.__appDb` 同构：以 `globalThis.__redisPool`
 * 维护 `Map<"connId:db", client>`，规避 Next dev 热重载导致的连接泄漏 / 句柄爆炸。
 * Redis 连接是有状态长连接，必须复用而非每请求新建。
 *
 * 运行时切库（db 0-15）：每个 (连接, db) 组合独立建 client（键 `connId:db`），
 * 而非在共享连接上 `SELECT`——后者在连接池 + 并发下有竞态。集群不支持多库，db 恒 0。
 *
 * 连接类型（单机 / 集群 / 哨兵）差异仅在建连入口，出口统一为 `RedisClient`，
 * 上层 keys/value/exec 拿到的接口一致（集群命令按槽位自动路由）。
 */
import Redis, { Cluster } from "ioredis";
import type { RedisConnection } from "./types";

/** 统一的客户端类型：单机 / 哨兵为 Redis，集群为 Cluster。 */
export type RedisClient = Redis | Cluster;

/** 建连通用选项：超时 + 有限重试，避免命令永久挂起。 */
const CONNECT_TIMEOUT = 5000;
function retryStrategy(times: number): number | null {
  return times > 5 ? null : Math.min(times * 200, 2000);
}

/** 解析实际选库：集群恒 0（不支持多库）；否则取 db（限 [0,15]），非法回退 conn.db。 */
export function effectiveDb(conn: RedisConnection, db?: number): number {
  if (conn.type === "cluster") return 0;
  const base = db ?? conn.db ?? 0;
  if (!Number.isInteger(base) || base < 0 || base > 15) return conn.db ?? 0;
  return base;
}

function poolMap(): Map<string, RedisClient> {
  const g = globalThis as unknown as { __redisPool?: Map<string, RedisClient> };
  if (!g.__redisPool) g.__redisPool = new Map();
  return g.__redisPool;
}

/**
 * 按连接配置建立客户端（不入池）。
 * @param overrides 覆盖 redisOptions（测试连接时用 lazyConnect / 快速失败）。
 * @param db 覆盖选库（单机 / 哨兵）；集群忽略。缺省用 conn.db。
 */
export function buildClient(
  conn: RedisConnection,
  overrides: Record<string, unknown> = {},
  db?: number
): RedisClient {
  const password = conn.password || undefined;
  const selectDb = effectiveDb(conn, db);

  let client: RedisClient;
  if (conn.type === "cluster") {
    client = new Redis.Cluster(
      conn.nodes.map((n) => ({ host: n.host, port: n.port })),
      {
        redisOptions: { password, connectTimeout: CONNECT_TIMEOUT, ...overrides },
        clusterRetryStrategy: retryStrategy,
      }
    );
  } else if (conn.type === "sentinel") {
    client = new Redis({
      sentinels: conn.nodes.map((n) => ({ host: n.host, port: n.port })),
      name: conn.masterName || "mymaster",
      password,
      db: selectDb,
      connectTimeout: CONNECT_TIMEOUT,
      maxRetriesPerRequest: 3,
      retryStrategy,
      ...overrides,
    });
  } else {
    const n = conn.nodes[0] ?? { host: "127.0.0.1", port: 6379 };
    client = new Redis({
      host: n.host,
      port: n.port,
      password,
      db: selectDb,
      connectTimeout: CONNECT_TIMEOUT,
      maxRetriesPerRequest: 3,
      retryStrategy,
      ...overrides,
    });
  }

  // 关键：必须监听 error，否则连接错误会作为未捕获异常拖垮进程。
  client.on("error", () => {
    /* 错误在命令调用处按 Promise 拒绝捕获，此处仅防未捕获崩溃 */
  });
  return client;
}

/** 取（或懒建）池中客户端；db 指定运行时选库（单机 / 哨兵），集群忽略。 */
export function getClient(conn: RedisConnection, db?: number): RedisClient {
  const pool = poolMap();
  const selectDb = effectiveDb(conn, db);
  const poolKey = `${conn.id}:${selectDb}`;
  const existing = pool.get(poolKey);
  if (existing) return existing;
  const client = buildClient(conn, {}, selectDb);
  pool.set(poolKey, client);
  return client;
}

/**
 * 销毁并移除某连接在池中的**全部 db 变体**（连接配置编辑 / 删除时调用）。
 * 键形如 `connId:db`，故按 `${id}:` 前缀清理所有库的 client，避免使用陈旧连接。
 */
export function dropClient(id: number): void {
  const pool = poolMap();
  const prefix = `${id}:`;
  for (const [poolKey, client] of pool) {
    if (!poolKey.startsWith(prefix)) continue;
    try {
      client.disconnect();
    } catch {
      /* 忽略断连异常 */
    }
    pool.delete(poolKey);
  }
}

/**
 * 测试连接：临时建连 → PING → 断开，不污染连接池。
 * 用 lazyConnect + 快速失败选项，超时兜底，返回可达性与耗时。
 */
export async function testConnection(
  conn: RedisConnection,
  timeoutMs = 5000
): Promise<{ ok: boolean; error?: string; latencyMs?: number }> {
  const client = buildClient(conn, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    retryStrategy: () => null,
  });

  const start = Date.now();
  try {
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`连接超时（>${timeoutMs / 1000}s）`)), timeoutMs)
    );
    await Promise.race([client.connect(), timeout]);
    await Promise.race([client.ping(), timeout]);
    return { ok: true, latencyMs: Date.now() - start };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "连接失败" };
  } finally {
    try {
      client.disconnect();
    } catch {
      /* 忽略 */
    }
  }
}

/** 集群下取各主节点；单机 / 哨兵返回客户端自身（视为单一节点）。 */
export function masterNodes(client: RedisClient): RedisClient[] {
  if (client instanceof Cluster) {
    return client.nodes("master");
  }
  return [client];
}

/** 判断是否集群客户端。 */
export function isCluster(client: RedisClient): client is Cluster {
  return client instanceof Cluster;
}
