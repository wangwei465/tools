"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { json, jsonParseLinter } from "@codemirror/lang-json";
import { linter } from "@codemirror/lint";
import { cmTheme } from "@/components/api-client/cmTheme";
import type { DatastoreConnection, EsIndexInfo, EsSearchResult } from "@/lib/datastore/types";
import { datastoreApi } from "@/components/datastore/api";
import { ResultPanel } from "@/components/datastore/ResultPanel";
import { ConfirmDialog, ErrorBar, HintBar, Pager } from "@/components/datastore/shared";

interface Props {
  conn: DatastoreConnection;
  indices: EsIndexInfo[];
  selectedIndex: string | null;
  onSelectIndex: (index: string) => void;
}

const METHODS = ["GET", "POST", "PUT", "DELETE", "HEAD"] as const;

const DEFAULT_DSL = `{
  "query": {
    "match_all": {}
  }
}`;

/** 待确认的危险操作。 */
interface Pending {
  message: string;
  operation: string;
}

/** 路径是否为 `_search`（决定是否由分页控件接管 from/size）。 */
function isSearchPath(path: string): boolean {
  return /\/_search\/?$/.test(path.split("?")[0] ?? "");
}

/**
 * ES 查询台：方法 + 路径 + JSON Body 三件套，与 Kibana Dev Tools 心智一致。
 * 选中索引后路径自动填 `/{index}/_search`，主路径是写 DSL 跑查询；
 * 同时天然覆盖写与危险操作——它们一律经服务端闸门判定，只读拦截 / 二次确认。
 *
 * 非法 JSON 在前端前置拦截，不发起请求。
 */
export function EsConsole({ conn, indices, selectedIndex, onSelectIndex }: Props) {
  const [method, setMethod] = useState<string>("POST");
  const [path, setPath] = useState("");
  const [dsl, setDsl] = useState(DEFAULT_DSL);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [result, setResult] = useState<EsSearchResult | null>(null);
  const [tookMs, setTookMs] = useState(0);
  const [error, setError] = useState("");
  const [running, setRunning] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);

  // 切换索引：路径回到该索引的 _search，翻页归零
  useEffect(() => {
    if (!selectedIndex) return;
    setPath(`/${selectedIndex}/_search`);
    setMethod("POST");
    setPage(0);
  }, [selectedIndex]);

  const extensions = useMemo(() => [cmTheme, json(), linter(jsonParseLinter())], []);
  const searchMode = isSearchPath(path);

  /**
   * 组装请求体。
   * `_search` 下 from/size 由分页控件接管（覆盖 DSL 里的同名字段），
   * 使翻页行为可预期；非 `_search` 路径原样发送。
   */
  const buildBody = useCallback(
    (targetPage: number): { body?: unknown; error?: string } => {
      const text = dsl.trim();
      if (!text) return { body: undefined };
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch (err) {
        return { error: `DSL 不是合法 JSON：${err instanceof Error ? err.message : "解析失败"}` };
      }
      if (!searchMode) return { body: parsed };
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return { error: "查询 DSL 必须是 JSON 对象" };
      }
      return {
        body: { ...(parsed as Record<string, unknown>), from: targetPage * pageSize, size: pageSize },
      };
    },
    [dsl, pageSize, searchMode]
  );

  const run = useCallback(
    async (targetPage: number, confirm = false) => {
      // 未选索引时路径为空，直接引导用户先选索引（比「路径不能为空」更贴近意图）
      if (!path.trim()) {
        setError(selectedIndex ? "请求路径不能为空" : "请先选择索引");
        return;
      }

      const built = buildBody(targetPage);
      if (built.error) {
        setError(built.error);
        return;
      }

      setRunning(true);
      setError("");
      try {
        const r = await datastoreApi.esQuery({
          connId: conn.id,
          method,
          path,
          body: built.body,
          confirm,
        });

        if (r.needConfirm) {
          setPending({ message: r.error ?? "危险操作，请确认", operation: r.description ?? path });
          return;
        }
        if (!r.ok) {
          setError(r.error ?? "查询失败");
          return;
        }
        setResult(r.result ?? null);
        setTookMs(r.tookMs ?? 0);
        setPage(targetPage);
      } finally {
        setRunning(false);
      }
    },
    [buildBody, conn.id, method, path, selectedIndex]
  );

  const confirmRun = () => {
    setPending(null);
    void run(page, true);
  };

  // 命中总数：relation=gte 表示「至少」（7.x 默认 track_total_hits 上限 10000）
  const totalText = result?.parsed
    ? `${result.relation === "gte" ? "≥ " : ""}${result.total.toLocaleString()}`
    : "-";

  return (
    <div className="ds-console">
      <div className="ds-console-bar">
        <select
          className="ds-conn-select"
          value={selectedIndex ?? ""}
          onChange={(e) => onSelectIndex(e.target.value)}
          title="目标索引"
        >
          <option value="">（选择索引）</option>
          {indices.map((i) => (
            <option key={i.index} value={i.index}>
              {i.index}
            </option>
          ))}
        </select>

        <select
          className="ds-method-select"
          value={method}
          onChange={(e) => setMethod(e.target.value)}
        >
          {METHODS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>

        <input
          className="ds-path-input"
          value={path}
          onChange={(e) => setPath(e.target.value)}
          placeholder="/index/_search"
          spellCheck={false}
        />

        <button className="ds-btn-primary" onClick={() => void run(0)} disabled={running}>
          {running ? "执行中…" : "执行"}
        </button>
      </div>

      {conn.mode === "readonly" && <HintBar>只读连接：写操作将被服务端拦截</HintBar>}
      {searchMode && <HintBar>分页由下方控件接管，将覆盖 DSL 中的 from / size</HintBar>}

      <div className="ds-console-editor">
        <CodeMirror
          value={dsl}
          onChange={setDsl}
          extensions={extensions}
          theme="dark"
          height="100%"
          basicSetup={{
            lineNumbers: true,
            foldGutter: true,
            bracketMatching: true,
            autocompletion: false,
            indentOnInput: true,
          }}
        />
      </div>

      <ErrorBar message={error} />

      <div className="ds-console-meta">
        <span className="ds-meta-item">
          命中 <b>{totalText}</b>
        </span>
        <span className="ds-meta-item">
          耗时 <b>{tookMs}ms</b>
          {result?.parsed && result.tookMs > 0 && (
            <span className="ds-meta-sub">（集群 {result.tookMs}ms）</span>
          )}
        </span>
        <div className="ds-spacer" />
        {searchMode && (
          <Pager
            page={page}
            pageSize={pageSize}
            total={result?.parsed ? result.total : undefined}
            count={result?.docs.length ?? 0}
            disabled={running || !result}
            onPage={(p) => void run(p)}
            onPageSize={(s) => {
              setPageSize(s);
              setPage(0);
            }}
          />
        )}
      </div>

      <div className="ds-console-result">
        {result ? (
          <ResultPanel
            docs={result.docs}
            raw={result.raw}
            emptyText={result.parsed ? "查询无命中" : "响应结构非查询结果，请看 JSON 视图"}
          />
        ) : (
          <div className="ds-empty-state">编写 DSL 后点击「执行」</div>
        )}
      </div>

      {pending && (
        <ConfirmDialog
          conn={conn}
          message={pending.message}
          operation={pending.operation}
          onCancel={() => setPending(null)}
          onConfirm={confirmRun}
        />
      )}
    </div>
  );
}
