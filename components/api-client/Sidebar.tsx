"use client";

import { useState } from "react";
import type { ApiNode, HistoryEntry, NodeType, RequestDraft, TreeNode } from "./types";
import { CollectionTree } from "./CollectionTree";
import { HistoryPanel } from "./HistoryPanel";

interface Props {
  tree: TreeNode[];
  history: HistoryEntry[];
  activeNodeId: number | null;
  /** nodeId → 集合节点名称（tab / 历史显示中文名）。 */
  nodeNames: Map<number, string>;
  onOpen: (node: ApiNode) => void;
  onCreate: (parentId: number | null, type: NodeType) => void;
  onRename: (id: number, name: string) => void;
  onDelete: (node: ApiNode) => void;
  onMove: (dragId: number, targetId: number | null, asChild: boolean) => void;
  onReplay: (snapshot: RequestDraft) => void;
  onDeleteHistory: (id: number) => void;
  onClearHistory: () => void;
}

/** 侧边栏容器：集合 / 历史两个视图切换。 */
export function Sidebar(p: Props) {
  const [tab, setTab] = useState<"tree" | "history">("tree");

  return (
    <aside className="apic-sidebar">
      <div className="apic-side-tabs">
        <button className={tab === "tree" ? "active" : ""} onClick={() => setTab("tree")}>
          集合
        </button>
        <button className={tab === "history" ? "active" : ""} onClick={() => setTab("history")}>
          历史
        </button>
      </div>
      {tab === "tree" ? (
        <CollectionTree
          tree={p.tree}
          activeNodeId={p.activeNodeId}
          onOpen={p.onOpen}
          onCreate={p.onCreate}
          onRename={p.onRename}
          onDelete={p.onDelete}
          onMove={p.onMove}
        />
      ) : (
        <HistoryPanel
          history={p.history}
          nodeNames={p.nodeNames}
          onReplay={p.onReplay}
          onDelete={p.onDeleteHistory}
          onClear={p.onClearHistory}
        />
      )}
    </aside>
  );
}
