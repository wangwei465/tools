"use client";

import { useMemo, useState } from "react";
import { timestampToDate, dateToTimestamp, nowMillis, TsUnit } from "@/lib/convert/datetime";
import { CopyButton, ErrorBar, ConverterFrame } from "./shared";

type Direction = "ts2date" | "date2ts";

/** 时间戳 ⇔ 日期互转。时间戳侧支持秒/毫秒，日期侧同时给出本地与 UTC。 */
export function DateTimeConverter() {
  const [direction, setDirection] = useState<Direction>("ts2date");
  const [unit, setUnit] = useState<TsUnit>("ms");
  const [input, setInput] = useState("");

  const tsResult = useMemo(
    () => (direction === "ts2date" && input.trim() ? timestampToDate(input, unit) : null),
    [direction, input, unit]
  );
  const dateResult = useMemo(
    () => (direction === "date2ts" && input.trim() ? dateToTimestamp(input) : null),
    [direction, input]
  );

  const fillNow = () => {
    const ms = nowMillis();
    if (direction === "ts2date") {
      setInput(String(unit === "s" ? Math.floor(ms / 1000) : ms));
    } else {
      setInput(new Date(ms).toISOString());
    }
  };

  const activeResult = direction === "ts2date" ? tsResult : dateResult;
  const error = activeResult && !activeResult.ok ? activeResult.error : null;

  return (
    <ConverterFrame title="时间戳 ⇔ 日期" desc="Unix 时间戳与可读日期互转，支持秒/毫秒，日期同时展示本地与 UTC。">
      <div className="conv-toolbar">
        <div className="conv-seg">
          <button
            className={`conv-seg-btn${direction === "ts2date" ? " active" : ""}`}
            onClick={() => setDirection("ts2date")}
          >
            时间戳 → 日期
          </button>
          <button
            className={`conv-seg-btn${direction === "date2ts" ? " active" : ""}`}
            onClick={() => setDirection("date2ts")}
          >
            日期 → 时间戳
          </button>
        </div>
        {direction === "ts2date" && (
          <div className="conv-seg">
            <button className={`conv-seg-btn${unit === "s" ? " active" : ""}`} onClick={() => setUnit("s")}>
              秒
            </button>
            <button className={`conv-seg-btn${unit === "ms" ? " active" : ""}`} onClick={() => setUnit("ms")}>
              毫秒
            </button>
          </div>
        )}
        <button className="btn-tool" onClick={fillNow}>
          取当前时间
        </button>
      </div>

      <div className="conv-field">
        <label className="conv-io-label">
          输入（{direction === "ts2date" ? `Unix 时间戳（${unit === "s" ? "秒" : "毫秒"}）` : "日期（建议 ISO 格式）"}）
        </label>
        <input
          className="conv-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={direction === "ts2date" ? (unit === "s" ? "1753600000" : "1753600000000") : "2026-07-27T10:00:00Z"}
        />
      </div>

      {/* 结果区 */}
      {tsResult?.ok && (
        <div className="conv-result-grid">
          <ResultRow label="ISO 8601 (UTC)" value={tsResult.value!.iso} />
          <ResultRow label="本地时间" value={tsResult.value!.local} />
          <ResultRow label="UTC" value={tsResult.value!.utc} />
        </div>
      )}
      {dateResult?.ok && (
        <div className="conv-result-grid">
          <ResultRow label="秒级时间戳" value={String(dateResult.value!.seconds)} />
          <ResultRow label="毫秒级时间戳" value={String(dateResult.value!.millis)} />
        </div>
      )}
      <ErrorBar error={error} />
    </ConverterFrame>
  );
}

function ResultRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="conv-result-row">
      <span className="conv-result-label">{label}</span>
      <span className="conv-result-value">{value}</span>
      <CopyButton text={value} />
    </div>
  );
}
