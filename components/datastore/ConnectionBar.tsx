"use client";

import type { DatastoreConnection, DatastoreEnv, DatastoreType } from "@/lib/datastore/types";

/** 环境标签中文与配色类（沿用 Redis 侧的 env-* 类名，同一套设计语言）。 */
export const ENV_META: Record<DatastoreEnv, { label: string; cls: string }> = {
  local: { label: "本地", cls: "env-local" },
  test: { label: "测试", cls: "env-test" },
  prod: { label: "生产", cls: "env-prod" },
};

/** 数据源类型中文。 */
export const TYPE_LABEL: Record<DatastoreType, string> = {
  es: "Elasticsearch",
  mongo: "MongoDB",
};

interface Props {
  connections: DatastoreConnection[];
  selected: DatastoreConnection | null;
  onSelect: (id: number) => void;
  onManage: () => void;
}

/**
 * 连接选择条：下拉选连接 + 类型 / 环境 / 模式标签常驻 + 管理入口。
 * 生产连接以 env-prod 显著标色，只读连接带只读标记，令误操作风险在操作前可见。
 */
export function ConnectionBar({ connections, selected, onSelect, onManage }: Props) {
  return (
    <div className="ds-connbar">
      <select
        className="ds-conn-select"
        value={selected?.id ?? ""}
        onChange={(e) => onSelect(Number(e.target.value))}
      >
        {connections.length === 0 && <option value="">（无连接）</option>}
        {connections.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>

      {selected && (
        <>
          <span className="ds-badge badge-type">{TYPE_LABEL[selected.type]}</span>
          <span className={`ds-badge ${ENV_META[selected.env].cls}`}>
            {ENV_META[selected.env].label}
          </span>
          <span className={`ds-badge ${selected.mode === "readonly" ? "mode-ro" : "mode-rw"}`}>
            {selected.mode === "readonly" ? "只读" : "读写"}
          </span>
        </>
      )}

      <button className="ds-btn-ghost" onClick={onManage}>
        管理连接
      </button>
    </div>
  );
}
