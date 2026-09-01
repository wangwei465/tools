"use client";

import { useState } from "react";
import { LinesPanel, LinesState, LINES_INITIAL } from "@/components/text-kit/LinesPanel";
import { NamingPanel, NamingState, NAMING_INITIAL } from "@/components/text-kit/NamingPanel";
import { ReplacePanel, ReplaceState, REPLACE_INITIAL } from "@/components/text-kit/ReplacePanel";
import { TablePanel, TableState, TABLE_INITIAL } from "@/components/text-kit/TablePanel";
import { StatsPanel, StatsState, STATS_INITIAL } from "@/components/text-kit/StatsPanel";
import { CodegenPanel, CodegenState, CODEGEN_INITIAL } from "@/components/text-kit/CodegenPanel";

type TabKey = "lines" | "naming" | "replace" | "table" | "stats" | "codegen";

const TABS: readonly { key: TabKey; label: string }[] = [
  { key: "lines", label: "行处理" },
  { key: "naming", label: "命名转换" },
  { key: "replace", label: "批量替换" },
  { key: "table", label: "表格转换" },
  { key: "stats", label: "文本统计" },
  { key: "codegen", label: "代码生成" },
] as const;

/**
 * 文本工具。
 *
 * 单页多标签容器，全部为纯前端计算：不出网、不落库。各面板的状态提升到页面
 * 级——常见用法是「在表格转换里整出一份 JSON，切到代码生成里生成实体类」，
 * 切一次标签就清空会让这个动作没法完成。
 */
export default function TextKitPage() {
  const [active, setActive] = useState<TabKey>("lines");

  const [lines, setLines] = useState<LinesState>(LINES_INITIAL);
  const [naming, setNaming] = useState<NamingState>(NAMING_INITIAL);
  const [replace, setReplace] = useState<ReplaceState>(REPLACE_INITIAL);
  const [table, setTable] = useState<TableState>(TABLE_INITIAL);
  const [stats, setStats] = useState<StatsState>(STATS_INITIAL);
  const [codegen, setCodegen] = useState<CodegenState>(CODEGEN_INITIAL);

  return (
    <div className="tk-page">
      <div className="tk-header">
        <h1 className="tk-title">文本工具</h1>
        <p className="tk-desc">
          行处理 / 命名转换 / 批量替换 / 表格转换 / 文本统计 / 代码生成 ·
          纯本地计算，不出网、不落库。
        </p>
      </div>

      <div className="tk-tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`tk-tab${active === t.key ? " active" : ""}`}
            onClick={() => setActive(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="tk-body">
        <div hidden={active !== "lines"}>
          <LinesPanel state={lines} setState={(p) => setLines((s) => ({ ...s, ...p }))} />
        </div>
        <div hidden={active !== "naming"}>
          <NamingPanel state={naming} setState={(p) => setNaming((s) => ({ ...s, ...p }))} />
        </div>
        <div hidden={active !== "replace"}>
          <ReplacePanel state={replace} setState={(p) => setReplace((s) => ({ ...s, ...p }))} />
        </div>
        <div hidden={active !== "table"}>
          <TablePanel state={table} setState={(p) => setTable((s) => ({ ...s, ...p }))} />
        </div>
        <div hidden={active !== "stats"}>
          <StatsPanel state={stats} setState={(p) => setStats((s) => ({ ...s, ...p }))} />
        </div>
        <div hidden={active !== "codegen"}>
          <CodegenPanel state={codegen} setState={(p) => setCodegen((s) => ({ ...s, ...p }))} />
        </div>
      </div>
    </div>
  );
}
