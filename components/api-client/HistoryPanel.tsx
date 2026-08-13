"use client";

import type { HistoryEntry, RequestDraft } from "./types";

/** 状态码配色（与响应区一致）。 */
function statusClass(s: number): string {
  if (s >= 200 && s < 300) return "s2";
  if (s >= 300 && s < 400) return "s3";
  if (s >= 400 && s < 500) return "s4";
  return "s5";
}

function shortUrl(u: string): string {
  const s = u.replace(/^https?:\/\//, "");
  return s.length > 30 ? s.slice(0, 30) + "…" : s || "（空地址）";
}

/** 从 ISO 时间取 HH:MM:SS（不引额外依赖）。 */
function timeLabel(iso: string): string {
  const t = iso.split("T")[1] ?? "";
  return t.slice(0, 8);
}

interface Props {
  history: HistoryEntry[];
  /** nodeId → 集合节点名称（用于来源已保存的历史显示中文名）。 */
  nodeNames: Map<number, string>;
  onReplay: (snapshot: RequestDraft) => void;
  onDelete: (id: number) => void;
  onClear: () => void;
}

/** 历史面板：倒序列表，双击 / ↺ 重放，可删除单条或清空。 */
export function HistoryPanel({ history, nodeNames, onReplay, onDelete, onClear }: Props) {
  return (
    <div className="apic-history">
      <div className="apic-tree-toolbar">
        <span className="apic-hist-count">{history.length} 条</span>
        {history.length > 0 && (
          <button title="清空历史" onClick={onClear}>
            清空
          </button>
        )}
      </div>
      <div className="apic-tree-body">
        {history.length === 0 ? (
          <div className="apic-tree-empty">暂无历史，发送请求后在此查看</div>
        ) : (
          history.map((h) => (
            <div
              className="apic-histrow"
              key={h.id}
              onDoubleClick={() => onReplay(h.snapshot)}
              title="双击重放"
            >
              <span className={`apic-code ${statusClass(h.status)}`}>{h.status || "ERR"}</span>
              <span className="apic-hist-method">{h.snapshot.method}</span>
              <span className="apic-hist-url">
                {h.nodeId != null && nodeNames.get(h.nodeId)
                  ? nodeNames.get(h.nodeId)
                  : shortUrl(h.snapshot.url)}
              </span>
              <span className="apic-hist-meta">{timeLabel(h.createdAt)}</span>
              <span className="apic-tree-actions" onClick={(e) => e.stopPropagation()}>
                <button title="重放" onClick={() => onReplay(h.snapshot)}>
                  ↺
                </button>
                <button title="删除" onClick={() => onDelete(h.id)}>
                  🗑
                </button>
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
