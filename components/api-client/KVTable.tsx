"use client";

import type { KV } from "./types";
import { emptyKV } from "./types";

interface Props {
  rows: KV[];
  onChange: (rows: KV[]) => void;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
}

/**
 * 通用键值表格，供 Query params / Headers / urlencoded Body 复用。
 * 每行含启用复选框、键、值、删除；末尾有「添加」按钮。
 */
export function KVTable({
  rows,
  onChange,
  keyPlaceholder = "键",
  valuePlaceholder = "值",
}: Props) {
  const update = (i: number, patch: Partial<KV>) =>
    onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const add = () => onChange([...rows, emptyKV()]);
  const remove = (i: number) => onChange(rows.filter((_, idx) => idx !== i));

  return (
    <div className="apic-kv">
      {rows.map((row, i) => (
        <div className="apic-kv-row" key={i}>
          <input
            type="checkbox"
            checked={row.enabled}
            onChange={(e) => update(i, { enabled: e.target.checked })}
            aria-label="启用该行"
          />
          <input
            className="apic-kv-key"
            value={row.key}
            placeholder={keyPlaceholder}
            onChange={(e) => update(i, { key: e.target.value })}
          />
          <input
            className="apic-kv-val"
            value={row.value}
            placeholder={valuePlaceholder}
            onChange={(e) => update(i, { value: e.target.value })}
          />
          <button className="apic-kv-del" onClick={() => remove(i)} aria-label="删除">
            ✕
          </button>
        </div>
      ))}
      <button className="apic-kv-add" onClick={add}>
        + 添加
      </button>
    </div>
  );
}
