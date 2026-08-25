"use client";

import { useState } from "react";
import { FillPanel } from "@/components/sql-kit/FillPanel";
import { FormatPanel } from "@/components/sql-kit/FormatPanel";
import { InListPanel } from "@/components/sql-kit/InListPanel";
import { InsertPanel } from "@/components/sql-kit/InsertPanel";

/** 面板注册表：新增面板只需在此追加一条并提供组件。 */
const TABS = [
  { key: "fill", label: "参数填充", Comp: FillPanel },
  { key: "format", label: "格式化", Comp: FormatPanel },
  { key: "inlist", label: "IN 列表", Comp: InListPanel },
  { key: "insert", label: "INSERT 生成", Comp: InsertPanel },
] as const;

/**
 * SQL 工具。
 *
 * 单页多标签容器，全部为纯前端文本处理：不连数据库、不执行 SQL、不落库。
 * 所有面板同时挂载、用 CSS 控制显隐——这里的输入往往是大段 SQL 与日志，
 * 切走再切回丢失的代价比多挂几个隐藏节点高得多。
 */
export default function SqlKitPage() {
  const [active, setActive] = useState<(typeof TABS)[number]["key"]>("fill");

  return (
    <div className="sqlk-page">
      <div className="sqlk-header">
        <h1 className="sqlk-title">SQL 工具</h1>
        <p className="sqlk-desc">
          参数填充 / 格式化 / IN 列表 / INSERT 生成 · 纯本地文本处理，不连接数据库、不执行任何语句。
        </p>
      </div>

      <div className="sqlk-tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`sqlk-tab${active === t.key ? " active" : ""}`}
            onClick={() => setActive(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="sqlk-body">
        {TABS.map((t) => (
          <div key={t.key} hidden={active !== t.key}>
            <t.Comp />
          </div>
        ))}
      </div>
    </div>
  );
}
