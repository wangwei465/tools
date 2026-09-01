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
  /**
   * 有序列名。SQL 结果集的列是有序的，且空结果集也有列定义，
   * 二者都无法从行对象推断，故由调用方传入；不传时维持字段并集推断（ES / Mongo）。
   */
  columns?: string[];
  /** 结果计数的单位词（ES / Mongo 为「文档」，关系型为「行」）。 */
  unit?: string;
  emptyText?: string;
}

type View = "json" | "table";

/**
 * 查询结果展示：JSON 视图（CodeMirror 只读）与表格视图切换，三类数据源共用。
 *
 * 排查时两种需求都真实存在：核对单个文档的嵌套结构看 JSON，横向比较十几条记录的
 * 某个字段看表格。ES / Mongo 的文档是异构的，故表格列取所有文档字段的并集而非
 * 首条文档的字段，某文档缺失的字段在其行内留空；SQL 结果集的列则是有序且固定的，
 * 由 columns 直接给定。
 */
export function ResultPanel({ docs, raw, columns: given, unit = "文档", emptyText = "暂无结果" }: Props) {
  const [view, setView] = useState<View>("json");

  // 列 = 所有文档字段的并集，按首次出现顺序（保持 _id 等元字段在前）
  const inferred = useMemo(() => {
    const seen = new Set<string>();
    for (const doc of docs) {
      for (const key of Object.keys(doc)) seen.add(key);
    }
    return [...seen];
  }, [docs]);

  const columns = given ?? inferred;

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
        <span className="ds-result-count">
          {docs.length} 条{unit}
        </span>
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
        ) : docs.length === 0 && columns.length === 0 ? (
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
            {docs.length === 0 && <EmptyState text={emptyText} />}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * 单元格：标量直接展示；嵌套对象 / 数组以折叠的 JSON 片段展示，不做递归展开。
 *
 * 三种「看起来都是空」的情况必须可区分，否则「这个字段到底有没有写进去」无从判断：
 * 字段缺失（present=false）留空、值为 NULL 标 NULL、空字符串标 (empty)。
 */
function Cell({ value, present }: { value: unknown; present: boolean }) {
  if (!present) return null;
  if (value === null || value === undefined) return <span className="ds-cell-null">NULL</span>;
  if (value === "") return <span className="ds-cell-empty">(empty)</span>;

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
