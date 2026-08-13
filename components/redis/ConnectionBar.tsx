"use client";

import type { RedisConnection, RedisEnv, RedisConnType } from "@/lib/redis/types";

/** 环境标签中文与配色类。 */
export const ENV_META: Record<RedisEnv, { label: string; cls: string }> = {
  local: { label: "本地", cls: "env-local" },
  test: { label: "测试", cls: "env-test" },
  prod: { label: "生产", cls: "env-prod" },
};

/** 连接类型中文。 */
export const TYPE_LABEL: Record<RedisConnType, string> = {
  standalone: "单机",
  cluster: "集群",
  sentinel: "哨兵",
};

interface Props {
  connections: RedisConnection[];
  selected: RedisConnection | null;
  db: number;
  onSelect: (id: number) => void;
  onSelectDb: (db: number) => void;
  onManage: () => void;
}

/**
 * 连接选择条：下拉选连接 + 数据库（0-15）+ 当前连接的环境 / 模式标签常驻展示 + 管理入口。
 * 环境与模式标签醒目常驻，便于操作前辨识（尤其区分生产）。
 * 集群不支持多库，故隐藏 DB 选择器、以静态徽标提示固定 DB 0。
 */
export function ConnectionBar({ connections, selected, db, onSelect, onSelectDb, onManage }: Props) {
  return (
    <div className="redis-connbar">
      <select
        className="redis-conn-select"
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

      {selected && selected.type !== "cluster" && (
        <label className="redis-db-select" title="切换数据库（0-15）">
          <span className="redis-db-select-label">DB</span>
          <select
            className="redis-db-select-input"
            value={db}
            onChange={(e) => onSelectDb(Number(e.target.value))}
          >
            {Array.from({ length: 16 }, (_, i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </select>
        </label>
      )}
      {selected?.type === "cluster" && (
        <span className="redis-badge badge-type" title="集群模式不支持多库，固定 DB 0">
          DB 0
        </span>
      )}

      {selected && (
        <>
          <span className={`redis-badge ${ENV_META[selected.env].cls}`}>
            {ENV_META[selected.env].label}
          </span>
          <span className="redis-badge badge-type">{TYPE_LABEL[selected.type]}</span>
          <span
            className={`redis-badge ${selected.mode === "readonly" ? "mode-ro" : "mode-rw"}`}
          >
            {selected.mode === "readonly" ? "只读" : "读写"}
          </span>
        </>
      )}

      <button className="redis-btn-ghost" onClick={onManage}>
        管理连接
      </button>
    </div>
  );
}
