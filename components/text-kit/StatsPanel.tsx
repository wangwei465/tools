"use client";

import { useMemo } from "react";
import { computeStats } from "@/lib/text-kit/stats";
import { checkSize } from "@/lib/text-kit/limits";
import { PanelFrame, TextField, ErrorBar } from "./shared";

export interface StatsState {
  input: string;
}

export const STATS_INITIAL: StatsState = { input: "" };

const ITEMS: readonly { key: keyof ReturnType<typeof computeStats>; label: string }[] = [
  { key: "chars", label: "字符数（含空白）" },
  { key: "charsNoWhitespace", label: "字符数（不含空白）" },
  { key: "lines", label: "行数" },
  { key: "words", label: "词数" },
  { key: "bytes", label: "UTF-8 字节数" },
  { key: "maxLineLength", label: "最长行长度" },
  { key: "minLineLength", label: "最短行长度" },
] as const;

/** 文本统计面板：输入即算，无需按钮。 */
export function StatsPanel({
  state,
  setState,
}: {
  state: StatsState;
  setState: (patch: Partial<StatsState>) => void;
}) {
  const over = checkSize(state.input);
  const stats = useMemo(
    () => computeStats(over ? "" : state.input),
    [state.input, over]
  );

  return (
    <PanelFrame title="文本统计" desc="字符数、行数、词数与 UTF-8 字节数——中文按实际编码计算，不用字符数冒充。">
      <TextField
        label="输入"
        value={state.input}
        onChange={(v) => setState({ input: v })}
        placeholder="粘贴要统计的文本"
        minHeight="220px"
      />

      <ErrorBar error={over?.error} />

      <div className="tk-stats">
        {ITEMS.map((item) => (
          <div key={item.key} className="tk-stat">
            <span className="tk-stat-label">{item.label}</span>
            <span className="tk-stat-value">{stats[item.key].toLocaleString()}</span>
          </div>
        ))}
      </div>
    </PanelFrame>
  );
}
