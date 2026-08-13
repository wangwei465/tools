"use client";

import { useMemo } from "react";
import { diffLines } from "diff";

interface Props {
  left: string;
  right: string;
}

/**
 * 字符串逐行 diff 展示（任务 5.5）。
 * 使用 `diff` 库的 diffLines，按行高亮新增、删除的内容。
 */
export function StringDiffPanel({ left, right }: Props) {
  const chunks = useMemo(() => diffLines(left, right), [left, right]);

  const hasChanges = chunks.some((c) => c.added || c.removed);

  if (!hasChanges) {
    return <div className="str-empty">内容完全相同</div>;
  }

  return (
    <div className="str-diff">
      {chunks.map((chunk, ci) => {
        const cls = chunk.added
          ? "chunk-added"
          : chunk.removed
          ? "chunk-removed"
          : "chunk-same";
        const prefix = chunk.added ? "+" : chunk.removed ? "−" : " ";

        // value 末尾带 "\n"，split 后末尾会产生空串；过滤掉。
        const lines = chunk.value.split("\n").filter((l, i, a) => i < a.length - 1 || l !== "");
        return lines.map((line: string, li: number) => (
          <div key={`${ci}-${li}`} className={`diff-line ${cls}`}>
            <span className="line-prefix">{prefix}</span>
            <span className="line-content">{line}</span>
          </div>
        ));
      })}
    </div>
  );
}
