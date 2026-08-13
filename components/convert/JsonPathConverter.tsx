"use client";

import { useMemo, useState } from "react";
import { evalJsonPath, formatHitValue } from "@/lib/convert/jsonpath";
import { CodeArea, CopyButton, ErrorBar, ConverterFrame } from "./shared";

/** JSONPath 提取器：粘贴 JSON + 表达式，列出全部命中的值与路径。 */
export function JsonPathConverter() {
  const [text, setText] = useState("");
  const [path, setPath] = useState("$");

  const result = useMemo(() => {
    if (!text.trim() || !path.trim()) return null;
    return evalJsonPath(text, path);
  }, [text, path]);

  const hits = result?.ok ? result.value!.hits : [];
  // 零命中是正常结果，用普通提示而非错误条呈现（与「表达式写错了」区分开）
  const zeroHit = result?.ok === true && hits.length === 0;

  const allValues = useMemo(
    () => (hits.length ? JSON.stringify(hits.map((h) => h.value), null, 2) : ""),
    [hits],
  );

  return (
    <ConverterFrame
      title="JSONPath 提取"
      desc="输入 JSONPath 表达式，从 JSON 中提取命中值及其所在路径。支持 $..field、[0]、[0:2]、[*]、[?(@.x>1)]。"
    >
      <div className="conv-field">
        <label className="conv-io-label">JSONPath 表达式</label>
        <input
          className="conv-input conv-mono"
          value={path}
          onChange={(e) => setPath(e.target.value)}
          placeholder="$..id"
        />
      </div>

      <div className="conv-field">
        <label className="conv-io-label">JSON 文档</label>
        <CodeArea value={text} onChange={setText} jsonMode placeholder="在此粘贴 JSON" />
      </div>

      <ErrorBar error={result && !result.ok ? result.error : null} />

      {zeroHit && (
        <div className="conv-jp-empty">无匹配——表达式合法，但该路径在当前文档中不存在。</div>
      )}

      {hits.length > 0 && (
        <>
          <div className="conv-jp-summary">
            <span>
              命中 {result!.value!.total} 处
              {result!.value!.truncated && `（已达上限，仅展示前 ${hits.length} 条）`}
            </span>
            <CopyButton text={allValues} label="复制全部值" />
          </div>

          <table className="conv-jp-table">
            <thead>
              <tr>
                <th>#</th>
                <th>路径</th>
                <th>值</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {hits.map((h, i) => (
                <tr key={i}>
                  <td className="conv-jp-idx">{i + 1}</td>
                  <td className="conv-mono conv-jp-path">{h.path}</td>
                  <td className="conv-mono conv-jp-val">{formatHitValue(h.value)}</td>
                  <td className="conv-jp-act">
                    <CopyButton text={h.path} label="复制路径" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </ConverterFrame>
  );
}
