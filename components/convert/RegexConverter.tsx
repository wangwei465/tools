"use client";

import { useMemo, useState, ReactNode } from "react";
import { testRegex } from "@/lib/convert/regex";
import { ErrorBar, ConverterFrame } from "./shared";

/** 正则测试器：pattern + flags + 测试文本，高亮匹配并列出捕获分组。 */
export function RegexConverter() {
  const [pattern, setPattern] = useState("");
  const [flags, setFlags] = useState("g");
  const [text, setText] = useState("");

  const result = useMemo(() => {
    if (!pattern || !text) return null;
    return testRegex(pattern, flags, text);
  }, [pattern, flags, text]);

  // 依据匹配区间把测试文本切成「普通 / 高亮」片段
  const highlighted: ReactNode = useMemo(() => {
    if (!result?.ok || result.value!.matches.length === 0) return null;
    const nodes: ReactNode[] = [];
    let cursor = 0;
    result.value!.matches.forEach((m, i) => {
      if (m.start > cursor) nodes.push(<span key={`t${i}`}>{text.slice(cursor, m.start)}</span>);
      nodes.push(
        <mark className="conv-rx-hit" key={`m${i}`}>
          {text.slice(m.start, m.end)}
        </mark>
      );
      cursor = m.end;
    });
    if (cursor < text.length) nodes.push(<span key="tail">{text.slice(cursor)}</span>);
    return nodes;
  }, [result, text]);

  const matches = result?.ok ? result.value!.matches : [];

  return (
    <ConverterFrame title="正则测试器" desc="输入表达式与 flags，在测试文本中高亮匹配并列出分组。">
      <div className="conv-rx-inputs">
        <div className="conv-field conv-rx-pattern">
          <label className="conv-io-label">正则表达式</label>
          <input
            className="conv-input conv-mono"
            value={pattern}
            onChange={(e) => setPattern(e.target.value)}
            placeholder="\\d+"
          />
        </div>
        <div className="conv-field conv-rx-flags">
          <label className="conv-io-label">flags</label>
          <input
            className="conv-input conv-mono"
            value={flags}
            onChange={(e) => setFlags(e.target.value)}
            placeholder="gimsuy"
          />
        </div>
      </div>

      <div className="conv-field">
        <label className="conv-io-label">测试文本</label>
        <textarea
          className="conv-textarea"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="在此粘贴要测试的文本"
        />
      </div>

      <ErrorBar error={result && !result.ok ? result.error : null} />

      {result?.ok && (
        <>
          <div className="conv-rx-summary">
            命中 {matches.length} 处
            {result.value!.singleMatch && "（未含 g，仅取首个匹配）"}
            {result.value!.truncated && "（已达上限截断）"}
          </div>
          {highlighted && <div className="conv-rx-preview">{highlighted}</div>}
          {matches.length > 0 && (
            <table className="conv-rx-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>匹配</th>
                  <th>位置</th>
                  <th>捕获分组</th>
                </tr>
              </thead>
              <tbody>
                {matches.map((m, i) => (
                  <tr key={i}>
                    <td className="conv-rx-idx">{i + 1}</td>
                    <td className="conv-mono">{m.match}</td>
                    <td className="conv-rx-pos">
                      {m.start}–{m.end}
                    </td>
                    <td className="conv-mono">
                      {m.groups.length === 0
                        ? "—"
                        : m.groups.map((g, gi) => (
                            <span className="conv-rx-group" key={gi}>
                              ${gi + 1}: {g === undefined ? "∅" : JSON.stringify(g)}
                            </span>
                          ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </ConverterFrame>
  );
}
