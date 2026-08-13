"use client";

import { useState } from "react";
import type { ApiNode, NodeType, TreeNode } from "./types";

interface Props {
  tree: TreeNode[];
  activeNodeId: number | null;
  onOpen: (node: ApiNode) => void;
  onCreate: (parentId: number | null, type: NodeType) => void;
  onRename: (id: number, name: string) => void;
  onDelete: (node: ApiNode) => void;
  onMove: (dragId: number, targetId: number | null, asChild: boolean) => void;
}

/**
 * 侧边栏集合树：层级展示、folder 展开/折叠、行内新建/重命名/删除、双击打开 request、
 * HTML5 拖拽移动（拖到 folder → 移入末尾；拖到 request → 排到其前；拖到根空白 → 根末尾）。
 */
export function CollectionTree(props: Props) {
  const { tree, onCreate, onMove } = props;
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [dragOverId, setDragOverId] = useState<number | "root" | null>(null);

  const toggle = (id: number) =>
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const expand = (id: number) => setExpanded((s) => new Set(s).add(id));

  const shared = {
    ...props,
    expanded,
    toggle,
    expand,
    renamingId,
    setRenamingId,
    dragOverId,
    setDragOverId,
  };

  return (
    <div className="apic-tree">
      <div className="apic-tree-toolbar">
        <button title="新建根文件夹" onClick={() => onCreate(null, "folder")}>
          📁＋
        </button>
        <button title="新建根请求" onClick={() => onCreate(null, "request")}>
          📄＋
        </button>
      </div>
      <div
        className={`apic-tree-body${dragOverId === "root" ? " dragover" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOverId("root");
        }}
        onDragLeave={() => setDragOverId((d) => (d === "root" ? null : d))}
        onDrop={(e) => {
          const dragId = Number(e.dataTransfer.getData("text/plain"));
          setDragOverId(null);
          if (dragId) onMove(dragId, null, true);
        }}
      >
        {tree.length === 0 ? (
          <div className="apic-tree-empty">暂无接口，点击上方 ＋ 新建</div>
        ) : (
          tree.map((n) => <TreeRow key={n.id} node={n} depth={0} {...shared} />)
        )}
      </div>
    </div>
  );
}

interface RowProps extends Props {
  node: TreeNode;
  depth: number;
  expanded: Set<number>;
  toggle: (id: number) => void;
  expand: (id: number) => void;
  renamingId: number | null;
  setRenamingId: (id: number | null) => void;
  dragOverId: number | "root" | null;
  setDragOverId: (id: number | "root" | null) => void;
}

function TreeRow(p: RowProps) {
  const {
    node,
    depth,
    expanded,
    toggle,
    expand,
    renamingId,
    setRenamingId,
    dragOverId,
    setDragOverId,
    activeNodeId,
    onOpen,
    onCreate,
    onRename,
    onDelete,
    onMove,
  } = p;
  const isFolder = node.type === "folder";
  const isOpen = expanded.has(node.id);
  const renaming = renamingId === node.id;

  const createChild = (type: NodeType) => {
    expand(node.id);
    onCreate(node.id, type);
  };

  return (
    <>
      <div
        className={`apic-treerow${node.id === activeNodeId ? " active" : ""}${
          dragOverId === node.id ? " dragover" : ""
        }`}
        style={{ paddingLeft: 6 + depth * 14 }}
        draggable={!renaming}
        onDragStart={(e) => {
          e.dataTransfer.setData("text/plain", String(node.id));
          e.stopPropagation();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDragOverId(node.id);
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          const dragId = Number(e.dataTransfer.getData("text/plain"));
          setDragOverId(null);
          if (!dragId || dragId === node.id) return;
          onMove(dragId, node.id, isFolder);
        }}
        onClick={() => isFolder && toggle(node.id)}
        onDoubleClick={() => !isFolder && onOpen(node)}
        title={node.name}
      >
        <span className="apic-tree-caret">{isFolder ? (isOpen ? "▾" : "▸") : ""}</span>
        <span className="apic-tree-ic">{isFolder ? "📁" : "📄"}</span>
        {renaming ? (
          <input
            className="apic-tree-rename"
            autoFocus
            defaultValue={node.name}
            onClick={(e) => e.stopPropagation()}
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v && v !== node.name) onRename(node.id, v);
              setRenamingId(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") setRenamingId(null);
            }}
          />
        ) : (
          <span className="apic-tree-name">{node.name}</span>
        )}
        <span className="apic-tree-actions" onClick={(e) => e.stopPropagation()}>
          {isFolder && (
            <>
              <button title="新建子文件夹" onClick={() => createChild("folder")}>
                📁
              </button>
              <button title="新建子请求" onClick={() => createChild("request")}>
                ＋
              </button>
            </>
          )}
          <button title="重命名" onClick={() => setRenamingId(node.id)}>
            ✎
          </button>
          <button title="删除" onClick={() => onDelete(node)}>
            🗑
          </button>
        </span>
      </div>
      {isFolder &&
        isOpen &&
        node.children.map((c) => <TreeRow key={c.id} {...p} node={c} depth={depth + 1} />)}
    </>
  );
}
