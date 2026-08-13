/**
 * INFO 监控：执行 INFO 并解析为分区结构。
 * 集群模式对各主节点分别取 INFO，按节点聚合返回。纯只读操作。
 */
import { isCluster, masterNodes, type RedisClient } from "./pool";
import type { InfoResult, NodeInfo } from "./types";

/**
 * 解析 INFO 原始文本为 { 分区: { 键: 值 } }。
 * INFO 格式：`# Section` 开头分区，`key:value` 逐行，空行分隔。
 */
export function parseInfo(raw: string): Record<string, Record<string, string>> {
  const sections: Record<string, Record<string, string>> = {};
  let current = "default";
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("#")) {
      current = trimmed.replace(/^#\s*/, "").toLowerCase();
      sections[current] ??= {};
      continue;
    }
    const idx = trimmed.indexOf(":");
    if (idx === -1) continue;
    sections[current] ??= {};
    sections[current][trimmed.slice(0, idx)] = trimmed.slice(idx + 1);
  }
  return sections;
}

/** 取节点标签：`host:port`；取不到时回退索引。 */
function nodeLabel(node: RedisClient, index: number): string {
  const opts = (node as unknown as { options?: { host?: string; port?: number } }).options;
  if (opts?.host && opts?.port) return `${opts.host}:${opts.port}`;
  return `node-${index}`;
}

/** 获取 INFO（集群按主节点聚合）。 */
export async function getInfo(client: RedisClient): Promise<InfoResult> {
  const cluster = isCluster(client);
  const nodes = masterNodes(client);

  const results: NodeInfo[] = await Promise.all(
    nodes.map(async (node, i) => {
      const raw = (await node.info()) as string;
      return {
        node: cluster ? nodeLabel(node, i) : "standalone",
        sections: parseInfo(raw),
      };
    })
  );
  return { nodes: results };
}
