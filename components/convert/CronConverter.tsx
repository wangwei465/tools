"use client";

import { useMemo, useState } from "react";
import { parseCron, MAX_PREVIEW } from "@/lib/convert/cron";
import { CopyButton, ErrorBar, ConverterFrame } from "./shared";

/**
 * Cron 表达式解析。
 *
 * 字段描述与执行时间预览分开呈现：前者解释「这个表达式想表达什么」，
 * 后者验证「它实际会在什么时候跑」——排障时两者缺一不可。
 */
export function CronConverter() {
  const [expr, setExpr] = useState("");
  const [count, setCount] = useState("10");
  const [baseTime, setBaseTime] = useState("");

  const result = useMemo(
    () => (expr.trim() ? parseCron(expr, Number(count), baseTime) : null),
    [expr, count, baseTime]
  );
  const view = result?.ok ? result.value! : null;

  const allTimes = view ? view.next.map((n) => n.local).join("\n") : "";

  return (
    <ConverterFrame
      title="Cron 表达式解析"
      desc="解析标准 5 段（分 时 日 月 周）与 6 段（含秒）表达式，给出字段含义与未来执行时间。"
    >
      <div className="conv-field">
        <label className="conv-io-label">Cron 表达式</label>
        <input
          className="conv-input conv-mono"
          value={expr}
          onChange={(e) => setExpr(e.target.value)}
          placeholder="0 0 9 * * 1-5"
        />
      </div>

      <div className="conv-toolbar">
        <label className="conv-inline-field">
          预览次数
          <input
            className="conv-input conv-input-sm"
            style={{ width: 70 }}
            value={count}
            onChange={(e) => setCount(e.target.value)}
            placeholder={`1-${MAX_PREVIEW}`}
          />
        </label>
        <label className="conv-inline-field">
          基准时间
          <input
            className="conv-input conv-mono"
            style={{ width: 230 }}
            value={baseTime}
            onChange={(e) => setBaseTime(e.target.value)}
            placeholder="留空表示当前时间"
          />
        </label>
        <button className="conv-copy" onClick={() => setBaseTime(new Date().toISOString())}>
          取当前时间
        </button>
      </div>

      {view && (
        <>
          <div className="conv-field">
            <label className="conv-io-label">
              字段含义{view.macro ? "" : `（${view.fieldCount} 段）`}
            </label>
            <div className="conv-cron-fields">
              {view.fields.map((f) => (
                <div className="conv-cron-field" key={f.name}>
                  <span className="conv-cron-fname">{f.name}</span>
                  <span className="conv-cron-fexpr conv-mono">{f.expr}</span>
                  <span className="conv-cron-fdesc">{f.desc}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="conv-field">
            <div className="conv-io-labelrow">
              <label className="conv-io-label">未来执行时间（共 {view.next.length} 次）</label>
              <CopyButton text={allTimes} label="复制全部" />
            </div>
            <div className="conv-cron-next">
              {view.next.map((n, i) => (
                <div className="conv-cron-row" key={n.iso + i}>
                  <span className="conv-cron-idx">{i + 1}</span>
                  <span className="conv-cron-local conv-mono">{n.local}</span>
                  <span className="conv-cron-iso conv-mono">{n.iso}</span>
                </div>
              ))}
              {view.next.length === 0 && (
                <div className="conv-notice">该表达式在基准时间之后没有更多执行时刻。</div>
              )}
            </div>
          </div>
        </>
      )}

      <ErrorBar error={result && !result.ok ? result.error : null} />
    </ConverterFrame>
  );
}
