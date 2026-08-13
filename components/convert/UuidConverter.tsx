"use client";

import { useState } from "react";
import { generateUuids } from "@/lib/convert/uuid";
import { CopyButton, ErrorBar, ConverterFrame } from "./shared";

/** UUID v4 批量生成。点击生成，逐行展示，可整体复制。 */
export function UuidConverter() {
  const [count, setCount] = useState(1);
  const [uuids, setUuids] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = () => {
    const r = generateUuids(count);
    if (r.ok) {
      setUuids(r.value!);
      setError(null);
    } else {
      setUuids([]);
      setError(r.error!);
    }
  };

  return (
    <ConverterFrame title="UUID v4 生成" desc="批量生成随机 UUID（版本 4）。">
      <div className="conv-toolbar">
        <label className="conv-inline-field">
          数量
          <input
            className="conv-input conv-input-sm"
            type="number"
            min={1}
            max={1000}
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
          />
        </label>
        <button className="conv-btn-primary" onClick={handleGenerate}>
          生成
        </button>
        {uuids.length > 0 && <CopyButton text={uuids.join("\n")} label="复制全部" />}
      </div>

      <ErrorBar error={error} />

      {uuids.length > 0 && (
        <div className="conv-uuid-list">
          {uuids.map((u, i) => (
            <div className="conv-uuid-row" key={i}>
              <span className="conv-uuid-idx">{i + 1}</span>
              <span className="conv-uuid-val">{u}</span>
              <CopyButton text={u} />
            </div>
          ))}
        </div>
      )}
    </ConverterFrame>
  );
}
