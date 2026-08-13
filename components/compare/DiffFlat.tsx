"use client";

import type { DiffEntry } from "@/lib/compare/jsonDiff";

interface Props {
  diffs: DiffEntry[];
}

const TYPE_META = {
  changed: { label: "值不同", className: "tag-changed", icon: "≠" },
  added:   { label: "右侧多出", className: "tag-added",   icon: "+" },
  removed: { label: "右侧缺失", className: "tag-removed", icon: "−" },
} as const;

/** 将 JSON value 格式化为可读字符串，超长截断。 */
function fmt(v: unknown): string {
  const s = JSON.stringify(v);
  return s.length > 80 ? s.slice(0, 80) + "…" : s;
}

/**
 * 扁平路径列表视图（任务 5.3）。
 * 逐条列出所有差异点，适合差异项少、需要快速总览的场景。
 */
export function DiffFlat({ diffs }: Props) {
  if (diffs.length === 0) {
    return <div className="diff-empty">无差异</div>;
  }

  // 按类型分组统计
  const counts = { changed: 0, added: 0, removed: 0 };
  for (const d of diffs) counts[d.type]++;

  return (
    <div className="diff-flat">
      {/* 摘要条 */}
      <div className="diff-summary">
        {counts.changed > 0 && (
          <span className="summary-chip chip-changed">{counts.changed} 项值不同</span>
        )}
        {counts.added > 0 && (
          <span className="summary-chip chip-added">+{counts.added} 右侧多出</span>
        )}
        {counts.removed > 0 && (
          <span className="summary-chip chip-removed">−{counts.removed} 右侧缺失</span>
        )}
      </div>

      {/* 差异列表 */}
      <div className="diff-list">
        {diffs.map((entry, i) => {
          const meta = TYPE_META[entry.type];
          return (
            <div key={i} className={`diff-row diff-row-${entry.type}`}>
              {/* 路径 */}
              <code className="diff-path">{entry.path}</code>

              {/* 类型标签 */}
              <span className={`diff-tag ${meta.className}`}>
                {meta.icon} {meta.label}
              </span>

              {/* 值 */}
              <div className="diff-values">
                {entry.type === "changed" && (
                  <>
                    <span className="val-left">{fmt(entry.left)}</span>
                    <span className="diff-arrow">→</span>
                    <span className="val-right">{fmt(entry.right)}</span>
                  </>
                )}
                {entry.type === "added" && (
                  <span className="val-right">{fmt(entry.right)}</span>
                )}
                {entry.type === "removed" && (
                  <span className="val-left">{fmt(entry.left)}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
