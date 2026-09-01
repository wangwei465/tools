"use client";

import { useCallback, useMemo, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { cmTheme } from "@/components/api-client/cmTheme";
import type { DatastoreConnection, RdbExecResult } from "@/lib/datastore/types";
import { datastoreApi } from "@/components/datastore/api";
import { ResultPanel } from "@/components/datastore/ResultPanel";
import { ConfirmDialog, ErrorBar, HintBar } from "@/components/datastore/shared";

interface Props {
  conn: DatastoreConnection;
}

interface Pending {
  message: string;
  operation: string;
}

/**
 * 关系型查询台：手写 SQL 执行，结果以表格 / JSON 双视图呈现。
 *
 * 三件事必须在界面上说清楚，否则这个工具本身就会成为排查时的误导源：
 * - 实际执行的 SQL（裸 SELECT 会被注入行数上限，用户看到什么就得是执行了什么）
 * - 结果是否被硬上限截断（截断而不标注等于静默丢数据）
 * - 危险语句执行前回显完整 SQL 并要求二次确认
 *
 * 写操作不做可视化编辑，一律手写 SQL 并过服务端闸门——避免点错格子就改了生产数据。
 */
export function RdbConsole({ conn }: Props) {
  const [sql, setSql] = useState("SELECT 1");
  const [result, setResult] = useState<RdbExecResult | null>(null);
  const [error, setError] = useState("");
  const [running, setRunning] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);

  const extensions = useMemo(() => [cmTheme], []);

  const run = useCallback(
    async (confirm = false) => {
      const text = sql.trim();
      if (!text) {
        setError("请输入 SQL");
        return;
      }

      setRunning(true);
      setError("");
      try {
        const r = await datastoreApi.rdbQuery({ connId: conn.id, sql: text, confirm });

        if (r.needConfirm) {
          setPending({
            message: r.error ?? "危险操作，请确认",
            operation: r.description ?? text,
          });
          return;
        }
        if (!r.ok) {
          // 只读拦截、多语句拒绝、语法错误、超时都走这里，服务端已翻译为可读文案
          setError(r.error ?? "执行失败");
          return;
        }
        setResult(r.result ?? null);
      } finally {
        setRunning(false);
      }
    },
    [conn.id, sql]
  );

  // 实际执行的 SQL 与输入不同时才提示，避免每次执行都刷一条无信息量的横幅
  const rewritten = result && result.executedSql.trim() !== sql.trim();

  return (
    <div className="ds-console">
      <div className="ds-console-bar">
        <span className="ds-meta-item">SQL</span>
        <div className="ds-spacer" />
        <button className="ds-btn-primary" onClick={() => void run()} disabled={running}>
          {running ? "执行中…" : "执行"}
        </button>
      </div>

      {conn.mode === "readonly" && (
        <HintBar>只读连接：写操作会被服务端拦截，并由数据库的只读事务再兜一道</HintBar>
      )}

      <div className="ds-console-editor">
        <CodeMirror
          value={sql}
          onChange={setSql}
          extensions={extensions}
          theme="dark"
          height="100%"
          basicSetup={{
            lineNumbers: true,
            foldGutter: false,
            bracketMatching: true,
            autocompletion: false,
            indentOnInput: true,
          }}
        />
      </div>

      <ErrorBar message={error} />

      {rewritten && (
        <HintBar>
          已追加行数上限，实际执行：<code className="ds-executed-sql">{result.executedSql}</code>
        </HintBar>
      )}
      {result?.truncated && (
        <HintBar>结果已截断：仅展示前 {result.rowCount.toLocaleString()} 行</HintBar>
      )}

      <div className="ds-console-meta">
        <span className="ds-meta-item">
          返回 <b>{result?.rowCount ?? 0}</b> 行
        </span>
        {result?.affectedRows != null && (
          <span className="ds-meta-item">
            影响 <b>{result.affectedRows}</b> 行
          </span>
        )}
        <span className="ds-meta-item">
          耗时 <b>{result?.tookMs ?? 0}ms</b>
        </span>
      </div>

      <div className="ds-console-result">
        {result ? (
          <ResultPanel
            docs={result.rows}
            raw={result.rows}
            columns={result.columns}
            unit="行"
            emptyText={result.columns.length > 0 ? "查询无结果" : "该语句没有结果集"}
          />
        ) : (
          <div className="ds-empty-state">输入 SQL 后点击「执行」</div>
        )}
      </div>

      {pending && (
        <ConfirmDialog
          conn={conn}
          message={pending.message}
          operation={pending.operation}
          onCancel={() => setPending(null)}
          onConfirm={() => {
            setPending(null);
            void run(true);
          }}
        />
      )}
    </div>
  );
}
