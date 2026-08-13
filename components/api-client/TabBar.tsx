"use client";

import type { Tab } from "./types";

interface Props {
  tabs: Tab[];
  activeTabId: string;
  /** nodeId → 集合节点名称（用于已保存 tab 显示中文名）。 */
  nodeNames: Map<number, string>;
  onActivate: (id: string) => void;
  onClose: (id: string) => void;
  onNew: () => void;
}

/**
 * 标签标题：
 * - 已关联集合节点 → 显示节点中文名；
 * - 未保存 → 无 URL 显示「未命名请求」，否则「方法 + 简短地址」。
 */
function tabTitle(tab: Tab, nodeNames: Map<number, string>): string {
  if (tab.nodeId != null) {
    const name = nodeNames.get(tab.nodeId);
    if (name) return name;
  }
  const url = tab.request.url.trim();
  if (!url) return "未命名请求";
  const short = url.replace(/^https?:\/\//, "");
  return `${tab.request.method} ${short.length > 24 ? short.slice(0, 24) + "…" : short}`;
}

/** 顶部标签栏：新建 / 切换 / 关闭；dirty 以 ● 标记。 */
export function TabBar({ tabs, activeTabId, nodeNames, onActivate, onClose, onNew }: Props) {
  return (
    <div className="apic-tabbar">
      {tabs.map((t) => (
        <div
          key={t.id}
          className={`apic-tab${t.id === activeTabId ? " active" : ""}`}
          onClick={() => onActivate(t.id)}
          title={t.request.url || "未命名请求"}
        >
          <span className="apic-tab-title">
            {t.dirty && <span className="apic-dot">●</span>}
            {tabTitle(t, nodeNames)}
          </span>
          <button
            className="apic-tab-close"
            onClick={(e) => {
              e.stopPropagation();
              onClose(t.id);
            }}
            aria-label="关闭标签"
          >
            ✕
          </button>
        </div>
      ))}
      <button className="apic-tab-new" onClick={onNew} aria-label="新建标签" title="新建标签">
        +
      </button>
    </div>
  );
}
