"use client";

import { useMemo, useState } from "react";
import type { DiffEntry } from "@/lib/compare/jsonDiff";
import type { JsonValue } from "@/lib/compare/normalize";

interface Props {
  left: JsonValue;
  right: JsonValue;
  diffs: DiffEntry[];
}

type NodeStatus = "changed" | "added" | "removed" | "same";

interface TreeNode {
  key: string;
  path: string;
  status: NodeStatus;
  leftVal: JsonValue | undefined;
  rightVal: JsonValue | undefined;
  children: TreeNode[];
}

/** 判断某路径是否在 diff 列表中，及其类型 */
function getDiffStatus(path: string, diffMap: Map<string, DiffEntry>): NodeStatus {
  const entry = diffMap.get(path);
  if (!entry) return "same";
  return entry.type === "added" ? "added" : entry.type === "removed" ? "removed" : "changed";
}

/** 判断某路径的任意子路径是否有差异（用于折叠节点的高亮提示）*/
function hasChildDiff(path: string, diffMap: Map<string, DiffEntry>): boolean {
  for (const k of diffMap.keys()) {
    if (k.startsWith(path + ".") || k.startsWith(path + "[")) return true;
  }
  return false;
}

/** 递归构建显示树 */
function buildTree(
  leftVal: JsonValue | undefined,
  rightVal: JsonValue | undefined,
  key: string,
  path: string,
  diffMap: Map<string, DiffEntry>
): TreeNode {
  const displayPath = path === "" ? "(root)" : path;
  const status = getDiffStatus(displayPath, diffMap);
  const node: TreeNode = { key, path: displayPath, status, leftVal, rightVal, children: [] };

  const allKeys = new Set<string>();

  if (leftVal !== null && typeof leftVal === "object" && !Array.isArray(leftVal)) {
    Object.keys(leftVal).forEach((k) => allKeys.add(k));
  }
  if (rightVal !== null && typeof rightVal === "object" && !Array.isArray(rightVal)) {
    Object.keys(rightVal as object).forEach((k) => allKeys.add(k));
  }

  const isArr =
    Array.isArray(leftVal) ||
    Array.isArray(rightVal);

  if (isArr) {
    const lArr = Array.isArray(leftVal) ? leftVal : [];
    const rArr = Array.isArray(rightVal) ? rightVal : [];
    const max = Math.max(lArr.length, rArr.length);
    for (let i = 0; i < max; i++) {
      const childPath = path === "" ? `[${i}]` : `${path}[${i}]`;
      node.children.push(
        buildTree(lArr[i], rArr[i], `[${i}]`, childPath, diffMap)
      );
    }
  } else if (allKeys.size > 0) {
    for (const k of Array.from(allKeys).sort()) {
      const childPath = path === "" ? k : `${path}.${k}`;
      const lv = leftVal !== null && typeof leftVal === "object" && !Array.isArray(leftVal) ? (leftVal as Record<string, JsonValue>)[k] : undefined;
      const rv = rightVal !== null && typeof rightVal === "object" && !Array.isArray(rightVal) ? (rightVal as Record<string, JsonValue>)[k] : undefined;
      node.children.push(buildTree(lv, rv, k, childPath, diffMap));
    }
  }

  return node;
}

const STATUS_COLOR: Record<NodeStatus, string> = {
  changed: "var(--changed-text)",
  added: "var(--added-text)",
  removed: "var(--removed-text)",
  same: "var(--text-muted)",
};

function fmt(v: JsonValue | undefined): string {
  if (v === undefined) return "";
  const s = JSON.stringify(v);
  return s.length > 60 ? s.slice(0, 60) + "…" : s;
}

/** 单个树节点行 */
function TreeNodeRow({
  node,
  depth,
  diffMap,
}: {
  node: TreeNode;
  depth: number;
  diffMap: Map<string, DiffEntry>;
}) {
  const hasChildren = node.children.length > 0;
  const [open, setOpen] = useState(true);
  const isLeaf = !hasChildren;
  const color = STATUS_COLOR[node.status];
  const hasDeeperDiff = hasChildDiff(node.path, diffMap);

  return (
    <div className="tree-node">
      <div
        className="tree-row"
        style={{ paddingLeft: depth * 16 + 8 }}
        onClick={() => hasChildren && setOpen((o) => !o)}
      >
        {/* 折叠箭头 */}
        <span className="tree-toggle">
          {hasChildren ? (open ? "▾" : "▸") : " "}
        </span>

        {/* key */}
        <span className="tree-key" style={{ color }}>
          {node.key}
        </span>

        {/* 叶节点：展示值 */}
        {isLeaf && (
          <span className="tree-value">
            {node.status === "changed" && (
              <>
                <span className="val-left">{fmt(node.leftVal)}</span>
                <span className="tree-arrow">→</span>
                <span className="val-right">{fmt(node.rightVal)}</span>
              </>
            )}
            {node.status === "added" && (
              <span className="val-right">{fmt(node.rightVal)}</span>
            )}
            {node.status === "removed" && (
              <span className="val-left">{fmt(node.leftVal)}</span>
            )}
            {node.status === "same" && (
              <span className="val-same">{fmt(node.leftVal)}</span>
            )}
          </span>
        )}

        {/* 折叠时提示有子差异 */}
        {hasChildren && !open && hasDeeperDiff && (
          <span className="tree-deep-hint">… 含差异</span>
        )}
      </div>

      {hasChildren && open && (
        <div className="tree-children">
          {node.children.map((child, i) => (
            <TreeNodeRow key={i} node={child} depth={depth + 1} diffMap={diffMap} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * 树形高亮差异视图（任务 5.4）。
 * 保留 JSON 结构，在发生变化的节点上以颜色高亮标注。
 */
export function DiffTree({ left, right, diffs }: Props) {
  const diffMap = useMemo(() => {
    const m = new Map<string, DiffEntry>();
    for (const d of diffs) m.set(d.path, d);
    return m;
  }, [diffs]);

  const root = useMemo(
    () => buildTree(left, right, "root", "", diffMap),
    [left, right, diffMap]
  );

  return (
    <div className="diff-tree">
      {root.children.map((child, i) => (
        <TreeNodeRow key={i} node={child} depth={0} diffMap={diffMap} />
      ))}
    </div>
  );
}
