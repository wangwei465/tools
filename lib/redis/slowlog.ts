/**
 * 慢查询日志：SLOWLOG GET/LEN 只读拉取 + RESET 清空。
 * 集群按主节点分别取并聚合（复用 masterNodes）。纯数据处理，安全闸门由路由层负责。
 *
 * SLOWLOG GET 每条为定长数组，Redis 4.0 起追加客户端地址 / 名两列。
 * 解析按数组长度容错回退，不硬取固定下标，兼容 4.0 前版本。
 */
import { isCluster, masterNodes, type RedisClient } from "./pool";
import type { NodeSlowlog, SlowlogEntry } from "./types";

/** SLOWLOG GET 默认拉取条数（与 redis-cli 习惯一致）。 */
export const DEFAULT_SLOWLOG_COUNT = 128;

/** call 的薄封装：收敛参数标量，规避 Redis | Cluster 联合类型的方法解析问题。 */
function call(node: RedisClient, cmd: string, ...args: (string | number)[]): Promise<unknown> {
  return node.call(cmd, ...args) as Promise<unknown>;
}

/**
 * 解析单条 SLOWLOG GET 原始条目为结构化。
 * 原始数组：[id, timestamp(秒), duration(微秒), [command,...], clientAddr?, clientName?]。
 * 4.0 前仅前 4 项，故 clientAddr/clientName 按长度容错，缺失回 undefined。
 */
function parseEntry(raw: unknown): SlowlogEntry | null {
  if (!Array.isArray(raw) || raw.length < 4) return null;
  const command = Array.isArray(raw[3]) ? raw[3].map((x) => String(x)) : [];
  return {
    id: Number(raw[0]),
    timestamp: Number(raw[1]),
    durationUs: Number(raw[2]),
    command,
    clientAddr: raw.length > 4 && raw[4] != null ? String(raw[4]) : undefined,
    clientName: raw.length > 5 && raw[5] != null ? String(raw[5]) : undefined,
  };
}

/** 取节点标签：`host:port`；取不到时回退索引。 */
function nodeLabel(node: RedisClient, index: number): string {
  const opts = (node as unknown as { options?: { host?: string; port?: number } }).options;
  if (opts?.host && opts?.port) return `${opts.host}:${opts.port}`;
  return `node-${index}`;
}

/** 从单节点拉取慢日志（LEN + GET <count>），解析为结构化条目。 */
async function getNodeSlowlog(node: RedisClient, label: string, count: number): Promise<NodeSlowlog> {
  const len = Number(await call(node, "SLOWLOG", "LEN"));
  const raw = await call(node, "SLOWLOG", "GET", count);
  const entries = Array.isArray(raw)
    ? raw.map(parseEntry).filter((e): e is SlowlogEntry => e !== null)
    : [];
  return { node: label, len, entries };
}

/** 获取慢查询（集群按主节点聚合）。纯只读。 */
export async function getSlowlog(
  client: RedisClient,
  count = DEFAULT_SLOWLOG_COUNT
): Promise<NodeSlowlog[]> {
  const cluster = isCluster(client);
  const nodes = masterNodes(client);
  return Promise.all(
    nodes.map((node, i) => getNodeSlowlog(node, cluster ? nodeLabel(node, i) : "standalone", count))
  );
}

/** 清空慢查询（集群逐主节点 RESET）。写操作，调用方负责安全闸门。 */
export async function resetSlowlog(client: RedisClient): Promise<void> {
  const nodes = masterNodes(client);
  await Promise.all(nodes.map((node) => call(node, "SLOWLOG", "RESET")));
}
