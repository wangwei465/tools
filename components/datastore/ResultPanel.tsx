"use client";

import { useMemo, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { json } from "@codemirror/lang-json";
import { cmTheme } from "@/components/api-client/cmTheme";
import { EmptyState } from "@/components/datastore/shared";

interface Props {
  docs: Array<Record<string, unknown>>;
  /** JSON 视图展示的完整响应（ES 为原始响应体，Mongo 为文档数组）。 */
  raw: unknown;
  emptyText?: string;
}

type View = "json" | "table";

/**
 * 查询结果展示：JSON 视图（CodeMirror 只读）与表格视图切换，ES 与 Mongo 共用。
 *
 * 排查时两种需求都真实存在：核对单个文档的嵌套结构看 JSON，横向比较十几条记录的
 * 某个字段看表格。文档是异构的，故表格列取所有文档字段的并集而非首条文档的字段，
 * 某文档缺失的字段在其行内留空。
 */
export function ResultPanel({ docs, raw, emptyText = "暂无结果" }: Props) {
  const [view, setView] = useState<View>("json");

  // 列 = 所有文档字段的并集，按首次出现顺序（保持 _id 等元字段在前）
  const columns = useMemo(() => {
    const seen = new Set<string>();
    for (const doc of docs) {
      for (const key of Object.keys(doc)) seen.add(key);
    }
    return [...seen];
  }, [docs]);

  const jsonText = useMemo(() => {
    try {
      return JSON.stringify(raw, null, 2);
    } catch {
      return String(raw);
    }
  }, [raw]);

  const extensions = useMemo(() => [cmTheme, json()], []);

  return (
    <div className="ds-result">
      <div className="ds-result-toolbar">
        {(
          [
            ["json", "JSON"],
            ["table", "表格"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            className={`ds-seg-btn${view === key ? " active" : ""}`}
            onClick={() => setView(key)}
          >
            {label}
          </button>
        ))}
        <div className="ds-spacer" />
        <span className="ds-result-count">{docs.length} 条文档</span>
      </div>

      <div className="ds-result-body">
        {view === "json" ? (
          <CodeMirror
            value={jsonText}
            editable={false}
            extensions={extensions}
            theme="dark"
            height="100%"
            basicSetup={{
              lineNumbers: true,
              foldGutter: true,
              highlightActiveLine: false,
              autocompletion: false,
            }}
          />
        ) : docs.length === 0 ? (
          <EmptyState text={emptyText} />
        ) : (
          <div className="ds-table-wrap">
            <table className="ds-table">
              <thead>
                <tr>
                  {columns.map((c) => (
                    <th key={c} title={c}>
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {docs.map((doc, i) => (
                  <tr key={i}>
                    {columns.map((c) => (
                      <td key={c}>
                        <Cell value={doc[c]} present={c in doc} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * 单元格：标量直接展示；嵌套对象 / 数组以折叠的 JSON 片段展示，不做递归展开。
 * 字段缺失（present=false）时留空，与「值为 null」区分开。
 */
function Cell({ value, present }: { value: unknown; present: boolean }) {
  if (!present) return null;
  if (value === null) return <span className="ds-cell-null">null</span>;
  if (value === undefined) return null;

  if (typeof value === "object") {
    const text = safeJson(value);
    return (
      <details className="ds-cell-nested">
        <summary>{Array.isArray(value) ? `[${value.length}]` : "{…}"}</summary>
        <pre>{text}</pre>
      </details>
    );
  }
  return <span className="ds-cell-text">{String(value)}</span>;
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
