/**
 * 键空间遍历：一律 SCAN 游标分页，禁用 KEYS（生产阻塞主线程）。
 *
 * 游标由前端持有并逐页回传，服务端无状态：
 * - 单机 / 哨兵：cursor 即 Redis 游标；nextCursor 为空串表示遍历结束。
 * - 集群：键分散在各主节点，单点 SCAN 会漏键。故复合游标 `"<节点索引>:<节点游标>"`，
 *   逐主节点扫完再进下一个；所有节点游标归 0 才算结束。
 */
import { isCluster, type RedisClient } from "./pool";
import type { KeyInfo, RedisKeyType, ScanResult } from "./types";

/** 单页 SCAN 的 COUNT 上限（提示值，非硬边界）。 */
const DEFAULT_COUNT = 100;

/** SCAN 分页遍历键空间。cursorIn 为空串表示从头开始。 */
export async function scanKeys(
  client: RedisClient,
  match: string,
  cursorIn: string,
  count = DEFAULT_COUNT
): Promise<ScanResult> {
  const pattern = match.trim() || "*";

  if (isCluster(client)) {
    return scanCluster(client, pattern, cursorIn, count);
  }

  const cursor = cursorIn || "0";
  const [next, keys] = (await client.scan(cursor, "MATCH", pattern, "COUNT", count)) as [
    string,
    string[]
  ];
  return { keys: await enrich(client, keys), nextCursor: next === "0" ? "" : next };
}

/** 集群逐主节点 SCAN，复合游标 `idx:cursor`。 */
async function scanCluster(
  client: RedisClient,
  pattern: string,
  cursorIn: string,
  count: number
): Promise<ScanResult> {
  const masters = (client as unknown as { nodes: (r: "master") => RedisClient[] }).nodes("master");
  let idx = 0;
  let cur = "0";
  if (cursorIn) {
    const sep = cursorIn.indexOf(":");
    idx = Number(cursorIn.slice(0, sep)) || 0;
    cur = cursorIn.slice(sep + 1) || "0";
  }
  if (idx >= masters.length) return { keys: [], nextCursor: "" };

  const [next, keys] = (await masters[idx].scan(cur, "MATCH", pattern, "COUNT", count)) as [
    string,
    string[]
  ];

  let nextCursor: string;
  if (next === "0") {
    // 本节点扫完，进下一节点；已是最后一节点则结束
    nextCursor = idx + 1 >= masters.length ? "" : `${idx + 1}:0`;
  } else {
    nextCursor = `${idx}:${next}`;
  }
  return { keys: await enrich(client, keys), nextCursor };
}

/** 为每个 key 补充类型与 TTL（集群下命令按键自动路由到对应节点）。 */
async function enrich(client: RedisClient, keys: string[]): Promise<KeyInfo[]> {
  return Promise.all(
    keys.map(async (key) => ({
      key,
      type: (await client.call("TYPE", key)) as RedisKeyType,
      ttl: Number(await client.call("TTL", key)),
    }))
  );
}
