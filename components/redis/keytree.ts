/**
 * 前缀树构建：把已加载的 KeyInfo[] 按分隔符组织为层级前缀树（纯前端，零后端改动）。
 * 平铺与树形共享同一份 keys 状态，「加载更多」新增键重建即并入。
 */
import type { KeyInfo } from "@/lib/redis/types";

/** 默认前缀分隔符（Redis 常见命名约定 `user:1:name`）。 */
export const DEFAULT_SEPARATOR = ":";

/**
 * 前缀树节点。
 * - 分支：children 非空，count 为其子树下的 key 总数。
 * - 叶子：fullKey/keyInfo 指向一个完整 key。
 * - 少数情况一个节点既是分支又是叶子（某 key 恰为另一 key 的前缀，如 `user` 与 `user:1`），
 *   此时 fullKey 与 children 并存，渲染层两者兼顾。
 */
export interface TreeNode {
  segment: string; // 该层前缀段
  fullKey?: string; // 叶子（或前缀恰为键）的完整 key
  keyInfo?: KeyInfo; // 对应 key 的类型 / TTL
  children: Map<string, TreeNode>;
  count: number; // 子树下 key 总数（含自身若为键）
}

/** 新建空节点。 */
function makeNode(segment: string): TreeNode {
  return { segment, children: new Map(), count: 0 };
}

/**
 * 由 KeyInfo[] 构建前缀树。
 * 逐 key 按 separator 拆段建节点，路径上累加 count，末段节点记 fullKey/keyInfo。
 * 无分隔符的键(如 `foo`)作根层叶子，不产生空前缀分组。
 * @returns 根层节点数组。
 */
export function buildKeyTree(keys: KeyInfo[], separator = DEFAULT_SEPARATOR): TreeNode[] {
  const root = new Map<string, TreeNode>();
  for (const info of keys) {
    const segments = info.key.split(separator);
    let level = root;
    let node: TreeNode | undefined;
    for (const seg of segments) {
      node = level.get(seg);
      if (!node) {
        node = makeNode(seg);
        level.set(seg, node);
      }
      node.count += 1;
      level = node.children;
    }
    if (node) {
      node.fullKey = info.key;
      node.keyInfo = info;
    }
  }
  return [...root.values()];
}

/** 是否分支节点（含子节点）。 */
export function isBranch(node: TreeNode): boolean {
  return node.children.size > 0;
}

/** 取排序后的子节点：分支在前、叶子在后，同类按 segment 字典序，视觉稳定。 */
export function sortedChildren(node: TreeNode): TreeNode[] {
  return [...node.children.values()].sort((a, b) => {
    const ab = isBranch(a) ? 0 : 1;
    const bb = isBranch(b) ? 0 : 1;
    if (ab !== bb) return ab - bb;
    return a.segment.localeCompare(b.segment);
  });
}
