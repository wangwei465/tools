import type { ApiNode, TreeNode } from "./types";

/**
 * 集合树纯函数：邻接表 ⇄ 树、子树收集、文件夹选项。
 * 无副作用，供前端组树与保存对话框复用。
 */

/** 邻接表节点列表 → 树（按 sortOrder、id 排序）。 */
export function buildTree(nodes: ApiNode[]): TreeNode[] {
  const byId = new Map<number, TreeNode>();
  for (const n of nodes) byId.set(n.id, { ...n, children: [] });

  const roots: TreeNode[] = [];
  for (const n of nodes) {
    const node = byId.get(n.id)!;
    if (n.parentId != null && byId.has(n.parentId)) {
      byId.get(n.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const sortRec = (arr: TreeNode[]) => {
    arr.sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
    for (const c of arr) sortRec(c.children);
  };
  sortRec(roots);
  return roots;
}

/** 收集某节点及其所有子孙 id（删除前算受影响的 tab）。 */
export function collectSubtreeIds(nodes: ApiNode[], rootId: number): number[] {
  const childrenOf = new Map<number, number[]>();
  for (const n of nodes) {
    if (n.parentId != null) {
      const arr = childrenOf.get(n.parentId) ?? [];
      arr.push(n.id);
      childrenOf.set(n.parentId, arr);
    }
  }
  const out: number[] = [];
  const stack = [rootId];
  while (stack.length) {
    const id = stack.pop()!;
    out.push(id);
    for (const c of childrenOf.get(id) ?? []) stack.push(c);
  }
  return out;
}

/** 展平树为文件夹选项（保存对话框选择位置）；含缩进层级 label。 */
export function folderOptions(tree: TreeNode[]): Array<{ id: number | null; label: string }> {
  const out: Array<{ id: number | null; label: string }> = [{ id: null, label: "/ (根目录)" }];
  const walk = (nodes: TreeNode[], depth: number) => {
    for (const n of nodes) {
      if (n.type === "folder") {
        out.push({ id: n.id, label: `${"　".repeat(depth)}${n.name}` });
        walk(n.children, depth + 1);
      }
    }
  };
  walk(tree, 0);
  return out;
}
