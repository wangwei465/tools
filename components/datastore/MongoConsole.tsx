"use client";

import { useCallback, useMemo, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { json, jsonParseLinter } from "@codemirror/lang-json";
import { linter } from "@codemirror/lint";
import { cmTheme } from "@/components/api-client/cmTheme";
import type { DatastoreConnection, MongoCollectionInfo } from "@/lib/datastore/types";
import { datastoreApi, type MongoOp } from "@/components/datastore/api";
import { ResultPanel } from "@/components/datastore/ResultPanel";
import { ConfirmDialog, ErrorBar, HintBar, Pager } from "@/components/datastore/shared";

interface Props {
  conn: DatastoreConnection;
  databases: string[];
  collections: MongoCollectionInfo[];
  selectedDb: string | null;
  onSelectDb: (db: string) => void;
  selectedCollection: string | null;
  onSelectCollection: (collection: string) => void;
}

const OPS: Array<{ value: MongoOp; label: string }> = [
  { value: "find", label: "find" },
  { value: "aggregate", label: "aggregate" },
  { value: "updateMany", label: "updateMany" },
  { value: "deleteMany", label: "deleteMany" },
];

/** 超过此偏移量即提示全扫描风险（Mongo 的大 skip 会逐条跳过）。 */
const LARGE_SKIP = 1000;

interface Pending {
  message: string;
  operation: string;
}

/** 一个 JSON 输入框：各项独立校验，非法 JSON 由调用方前置拦截。 */
function JsonInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const extensions = useMemo(() => [cmTheme, json(), linter(jsonParseLinter())], []);
  return (
    <div className="ds-console-input-col">
      <label>{label}</label>
      <div className="ds-console-editor">
        <CodeMirror
          value={value}
          onChange={onChange}
          extensions={extensions}
          theme="dark"
          height="100%"
          basicSetup={{
            lineNumbers: false,
            foldGutter: false,
            bracketMatching: true,
            autocompletion: false,
            indentOnInput: true,
          }}
        />
      </div>
    </div>
  );
}

/** 解析一项 JSON 输入；空串视为缺省。 */
function parseJsonField(
  text: string,
  label: string
): { value?: unknown; error?: string } {
  const t = text.trim();
  if (!t) return { value: undefined };
  try {
    return { value: JSON.parse(t) };
  } catch (err) {
    return { error: `${label}不是合法 JSON：${err instanceof Error ? err.message : "解析失败"}` };
  }
}

/**
 * MongoDB 查询台：find 与 aggregate 两种输入形态切换。
 * find 侧各项（过滤 / 投影 / 排序）独立成编辑器并各自校验；aggregate 侧为单个管道数组。
 * 写操作（updateMany / deleteMany）不做可视化编辑，靠手写过滤条件提交，
 * 是否放行一律由服务端闸门判定——空过滤条件会被升级为危险操作并要求二次确认。
 */
export function MongoConsole({
  conn,
  databases,
  collections,
  selectedDb,
  onSelectDb,
  selectedCollection,
  onSelectCollection,
}: Props) {
  const [op, setOp] = useState<MongoOp>("find");
  const [filter, setFilter] = useState("{}");
  const [projection, setProjection] = useState("");
  const [sort, setSort] = useState("");
  const [update, setUpdate] = useState('{ "$set": {} }');
  const [pipeline, setPipeline] = useState('[\n  { "$match": {} }\n]');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [docs, setDocs] = useState<Array<Record<string, unknown>> | null>(null);
  const [tookMs, setTookMs] = useState(0);
  const [error, setError] = useState("");
  const [running, setRunning] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);

  const isFind = op === "find";
  const isAggregate = op === "aggregate";
  const usesFilter = op !== "aggregate";
  const skip = page * pageSize;

  /** 组装入参，任一 JSON 非法即返回错误，不发起查询。 */
  const buildInput = useCallback(
    (targetPage: number) => {
      const parts: Array<{ value?: unknown; error?: string }> = [];

      if (usesFilter) parts.push(parseJsonField(filter, "过滤条件"));
      if (isFind) {
        parts.push(parseJsonField(projection, "投影"));
        parts.push(parseJsonField(sort, "排序"));
      }
      if (op === "updateMany") parts.push(parseJsonField(update, "更新文档"));
      if (isAggregate) parts.push(parseJsonField(pipeline, "聚合管道"));

      const bad = parts.find((p) => p.error);
      if (bad) return { error: bad.error };

      if (isAggregate) {
        const pipelineValue = parts[0].value ?? [];
        // 管道必须为数组：前端先拦一道，不发起查询
        if (!Array.isArray(pipelineValue)) {
          return { error: "聚合管道必须为 JSON 数组" };
        }
        return { input: { op, pipeline: pipelineValue } };
      }

      const [filterPart, ...rest] = parts;
      if (isFind) {
        return {
          input: {
            op,
            filter: filterPart.value ?? {},
            projection: rest[0]?.value,
            sort: rest[1]?.value,
            skip: targetPage * pageSize,
            limit: pageSize,
          },
        };
      }
      return {
        input: {
          op,
          filter: filterPart.value ?? {},
          ...(op === "updateMany" ? { update: rest[0]?.value ?? {} } : {}),
        },
      };
    },
    [filter, isAggregate, isFind, op, pageSize, pipeline, projection, sort, update, usesFilter]
  );

  const run = useCallback(
    async (targetPage: number, confirm = false) => {
      if (!selectedDb) {
        setError("请先选择数据库");
        return;
      }
      if (!selectedCollection) {
        setError("请先选择集合");
        return;
      }

      const built = buildInput(targetPage);
      if (built.error || !built.input) {
        setError(built.error ?? "参数不合法");
        return;
      }

      setRunning(true);
      setError("");
      try {
        const r = await datastoreApi.mongoQuery({
          connId: conn.id,
          db: selectedDb,
          collection: selectedCollection,
          confirm,
          ...built.input,
        } as Parameters<typeof datastoreApi.mongoQuery>[0]);

        if (r.needConfirm) {
          setPending({
            message: r.error ?? "危险操作，请确认",
            operation: r.description ?? op,
          });
          return;
        }
        if (!r.ok) {
          setError(r.error ?? "查询失败");
          return;
        }
        setDocs(r.docs ?? []);
        setTookMs(r.tookMs ?? 0);
        setPage(targetPage);
      } finally {
        setRunning(false);
      }
    },
    [buildInput, conn.id, op, selectedCollection, selectedDb]
  );

  return (
    <div className="ds-console">
      <div className="ds-console-bar">
        <select
          className="ds-conn-select"
          value={selectedDb ?? ""}
          onChange={(e) => onSelectDb(e.target.value)}
          title="数据库"
        >
          <option value="">（选择数据库）</option>
          {databases.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>

        <select
          className="ds-conn-select"
          value={selectedCollection ?? ""}
          onChange={(e) => onSelectCollection(e.target.value)}
          title="集合"
        >
          <option value="">（选择集合）</option>
          {collections.map((c) => (
            <option key={c.name} value={c.name}>
              {c.name}
            </option>
          ))}
        </select>

        <select
          className="ds-method-select"
          value={op}
          onChange={(e) => {
            setOp(e.target.value as MongoOp);
            setPage(0);
          }}
        >
          {OPS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>

        <div className="ds-spacer" />
        <button className="ds-btn-primary" onClick={() => void run(0)} disabled={running}>
          {running ? "执行中…" : "执行"}
        </button>
      </div>

      {conn.mode === "readonly" && <HintBar>只读连接：写操作将被服务端拦截</HintBar>}
      {isFind && skip >= LARGE_SKIP && (
        <HintBar>
          当前偏移量 {skip.toLocaleString()}：Mongo 的大 skip 会逐条跳过文档（全扫描），
          建议缩小过滤条件或按索引字段范围翻页
        </HintBar>
      )}

      <div className="ds-console-inputs">
        {isAggregate ? (
          <JsonInput label="聚合管道（JSON 数组）" value={pipeline} onChange={setPipeline} />
        ) : (
          <>
            <JsonInput label="过滤条件" value={filter} onChange={setFilter} />
            {isFind && <JsonInput label="投影（留空为全部字段）" value={projection} onChange={setProjection} />}
            {isFind && <JsonInput label="排序（留空为默认顺序）" value={sort} onChange={setSort} />}
            {op === "updateMany" && <JsonInput label="更新文档" value={update} onChange={setUpdate} />}
          </>
        )}
      </div>

      <ErrorBar message={error} />

      <div className="ds-console-meta">
        <span className="ds-meta-item">
          耗时 <b>{tookMs}ms</b>
        </span>
        <div className="ds-spacer" />
        {isFind && (
          <Pager
            page={page}
            pageSize={pageSize}
            count={docs?.length ?? 0}
            disabled={running || !docs}
            onPage={(p) => void run(p)}
            onPageSize={(s) => {
              setPageSize(s);
              setPage(0);
            }}
          />
        )}
      </div>

      <div className="ds-console-result">
        {docs ? (
          <ResultPanel docs={docs} raw={docs} emptyText="查询无结果" />
        ) : (
          <div className="ds-empty-state">填写查询条件后点击「执行」</div>
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
            void run(page, true);
          }}
        />
      )}
    </div>
  );
}
