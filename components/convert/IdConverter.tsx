"use client";

import { useMemo, useState } from "react";
import {
  parseId,
  detectKind,
  DEFAULT_LAYOUT,
  EPOCH_PRESETS,
  IdKind,
  SnowflakeLayout,
  SnowflakeView,
  ObjectIdView,
} from "@/lib/convert/id";
import { CopyButton, ErrorBar, ConverterFrame } from "./shared";

/**
 * 分布式 ID 反解。
 *
 * 雪花 ID 的纪元与位宽各家实现不同，选错只会让时间整体偏移而不报错，
 * 故一律显式可配并给出预设，不做自动嗅探。
 */
export function IdConverter() {
  const [kind, setKind] = useState<IdKind>("auto");
  const [input, setInput] = useState("");
  const [epoch, setEpoch] = useState(String(EPOCH_PRESETS[0].value));
  const [layout, setLayout] = useState<SnowflakeLayout>(DEFAULT_LAYOUT);

  const result = useMemo(() => {
    if (!input.trim()) return null;
    return parseId(input, kind, Number(epoch), layout);
  }, [input, kind, epoch, layout]);

  // 雪花参数区始终展示，避免切换输入时布局跳动；当前解析为 ObjectId 时标注不适用
  const effectiveKind = kind === "auto" ? detectKind(input) : kind;
  const snowflakeApplies = !input.trim() || effectiveKind !== "objectid";

  const setBits = (key: keyof SnowflakeLayout, raw: string) => {
    const n = Number(raw);
    setLayout((prev) => ({ ...prev, [key]: Number.isFinite(n) ? n : 0 }));
  };

  const view = result?.ok ? result.value : null;
  const snowflake = view?.kind === "snowflake" ? (view as SnowflakeView) : null;
  const objectId = view?.kind === "objectid" ? (view as ObjectIdView) : null;

  return (
    <ConverterFrame
      title="分布式 ID 解析"
      desc="反解雪花（Snowflake）ID 与 MongoDB ObjectId。雪花 ID 走 BigInt 拆解，纪元与位宽可配。"
    >
      <div className="conv-toolbar">
        <div className="conv-seg">
          {(
            [
              ["auto", "自动识别"],
              ["snowflake", "雪花 ID"],
              ["objectid", "ObjectId"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              className={`conv-seg-btn${kind === k ? " active" : ""}`}
              onClick={() => setKind(k)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="conv-field">
        <label className="conv-io-label">ID</label>
        <input
          className="conv-input conv-mono"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="1234567890123456789 或 65a1b2c3d4e5f60718293a4b"
        />
      </div>

      {/* 雪花参数：纪元与位宽 */}
      <div className="conv-toolbar" style={{ opacity: snowflakeApplies ? 1 : 0.45 }}>
        <span className="conv-io-label">雪花参数</span>
        <label className="conv-inline-field">
          纪元
          <select
            className="conv-input conv-input-sm"
            style={{ width: 190 }}
            value={EPOCH_PRESETS.some((p) => String(p.value) === epoch) ? epoch : "custom"}
            onChange={(e) => {
              if (e.target.value !== "custom") setEpoch(e.target.value);
            }}
          >
            {EPOCH_PRESETS.map((p) => (
              <option key={p.key} value={String(p.value)}>
                {p.label}
              </option>
            ))}
            <option value="custom">自定义</option>
          </select>
        </label>
        <input
          className="conv-input conv-mono"
          style={{ width: 150 }}
          value={epoch}
          onChange={(e) => setEpoch(e.target.value)}
          placeholder="1288834974657"
        />
        <label className="conv-inline-field">
          时间戳位
          <input
            className="conv-input conv-input-sm"
            style={{ width: 60 }}
            value={layout.timestampBits}
            onChange={(e) => setBits("timestampBits", e.target.value)}
          />
        </label>
        <label className="conv-inline-field">
          机器位
          <input
            className="conv-input conv-input-sm"
            style={{ width: 60 }}
            value={layout.machineBits}
            onChange={(e) => setBits("machineBits", e.target.value)}
          />
        </label>
        <label className="conv-inline-field">
          序列位
          <input
            className="conv-input conv-input-sm"
            style={{ width: 60 }}
            value={layout.sequenceBits}
            onChange={(e) => setBits("sequenceBits", e.target.value)}
          />
        </label>
      </div>

      {snowflake && (
        <div className="conv-result-grid">
          <ResultRow label="类型" value="雪花（Snowflake）ID" />
          <ResultRow label="本地时间" value={snowflake.time.local} />
          <ResultRow label="UTC" value={snowflake.time.utc} />
          <ResultRow label="ISO 8601" value={snowflake.time.iso} />
          <ResultRow label="毫秒时间戳" value={String(snowflake.millis)} />
          <ResultRow label="时间戳段原值" value={snowflake.timestampDelta} />
          <ResultRow label="机器位" value={snowflake.machineId} />
          <ResultRow label="序列号" value={snowflake.sequence} />
        </div>
      )}

      {objectId && (
        <div className="conv-result-grid">
          <ResultRow label="类型" value="MongoDB ObjectId" />
          <ResultRow label="本地时间" value={objectId.time.local} />
          <ResultRow label="UTC" value={objectId.time.utc} />
          <ResultRow label="ISO 8601" value={objectId.time.iso} />
          <ResultRow label="秒级时间戳" value={String(objectId.seconds)} />
          <ResultRow label="随机值 + 计数器" value={objectId.rest} />
        </div>
      )}

      <ErrorBar error={result && !result.ok ? result.error : null} />
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
