"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { DatastoreConnection, EsField, EsIndexInfo } from "@/lib/datastore/types";
import { datastoreApi } from "@/components/datastore/api";
import { EmptyState, ErrorBar, FilterInput } from "@/components/datastore/shared";

interface Props {
  conn: DatastoreConnection;
  indices: EsIndexInfo[];
  indicesError: string;
  loading: boolean;
  onReload: () => void;
  selectedIndex: string | null;
  onSelectIndex: (index: string) => void;
}

/** 健康状态配色类。 */
const HEALTH_CLS: Record<string, string> = {
  green: "ds-health-green",
  yellow: "ds-health-yellow",
  red: "ds-health-red",
};

/** 每层树形缩进（px）。 */
const INDENT = 14;
const ROW_PAD = 10;

/**
 * ES 目录浏览：左侧索引列表（名称过滤），右侧所选索引的 mapping 字段树。
 * 索引列表由页面统一加载后下发（查询台也要用），mapping 按索引懒加载。
 * 集群不可达时展示可读错误提示，页面不崩溃。
 */
export function EsCatalog({
  conn,
  indices,
  indicesError,
  loading,
  onReload,
  selectedIndex,
  onSelectIndex,
}: Props) {
  const [filter, setFilter] = useState("");
  const [fields, setFields] = useState<EsField[]>([]);
  const [fieldsError, setFieldsError] = useState("");
  const [fieldsLoading, setFieldsLoading] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    const kw = filter.trim().toLowerCase();
    return kw ? indices.filter((i) => i.index.toLowerCase().includes(kw)) : indices;
  }, [indices, filter]);

  const loadMapping = useCallback(
    async (index: string) => {
      setFieldsLoading(true);
      setFieldsError("");
      const r = await datastoreApi.esMapping(conn.id, index);
      if (!r.ok) {
        setFields([]);
        setFieldsError(r.error ?? "读取 mapping 失败");
      } else {
        setFields(r.fields ?? []);
        // 默认展开第一层容器字段，省一次点击
        setExpanded(new Set((r.fields ?? []).filter((f) => f.children).map((f) => f.path)));
      }
      setFieldsLoading(false);
    },
    [conn.id]
  );

  useEffect(() => {
    if (!selectedIndex) {
      setFields([]);
      setFieldsError("");
      return;
    }
    void loadMapping(selectedIndex);
  }, [selectedIndex, loadMapping]);

  const toggle = (path: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  /** 递归渲染字段树；object / nested 可展开。 */
  const renderFields = (list: EsField[], depth: number): ReactNode[] =>
    list.flatMap((f) => {
      const hasChildren = !!f.children?.length;
      const open = expanded.has(f.path);
      const rows: ReactNode[] = [
        <div
          key={f.path}
          className={`ds-field-row-item${hasChildren ? " branch" : ""}`}
          style={{ paddingLeft: ROW_PAD + depth * INDENT }}
          onClick={hasChildren ? () => toggle(f.path) : undefined}
          title={f.path}
        >
          <span className="ds-caret">{hasChildren ? (open ? "▾" : "▸") : ""}</span>
          <span className="ds-field-name">{f.name}</span>
          <span className="ds-field-type">{f.type}</span>
        </div>,
      ];
      if (hasChildren && open) rows.push(...renderFields(f.children!, depth + 1));
      return rows;
    });

  return (
    <div className="ds-catalog">
      {/* 左：索引列表 */}
      <div className="ds-list-pane">
        <div className="ds-list-toolbar">
          <FilterInput value={filter} onChange={setFilter} placeholder="过滤索引名…" />
          <button className="ds-btn-ghost-sm" onClick={onReload} disabled={loading}>
            {loading ? "加载中…" : "刷新"}
          </button>
        </div>

        <ErrorBar message={indicesError} onRetry={onReload} />

        <div className="ds-list">
          {filtered.map((i) => (
            <div
              key={i.index}
              className={`ds-index-row${selectedIndex === i.index ? " active" : ""}`}
              onClick={() => onSelectIndex(i.index)}
            >
              <span className={`ds-dot ${HEALTH_CLS[i.health] ?? "ds-health-unknown"}`} title={i.health || "未知"} />
              <span className="ds-index-name" title={i.index}>
                {i.index}
              </span>
              <span className="ds-index-docs">{i.docsCount.toLocaleString()} 条</span>
              <span className="ds-index-size">{i.storeSize}</span>
            </div>
          ))}
          {!loading && !indicesError && filtered.length === 0 && (
            <EmptyState text={indices.length === 0 ? "该集群没有索引" : "无匹配的索引"} />
          )}
        </div>

        <div className="ds-list-footer">共 {filtered.length} 个索引</div>
      </div>

      {/* 右：mapping 字段树 */}
      <div className="ds-detail-pane">
        {!selectedIndex ? (
          <EmptyState text="选择左侧索引查看 mapping 字段" />
        ) : (
          <>
            <div className="ds-detail-header">
              <span className="ds-detail-title">{selectedIndex}</span>
              <span className="ds-detail-sub">mapping 字段</span>
            </div>
            <ErrorBar message={fieldsError} onRetry={() => loadMapping(selectedIndex)} />
            <div className="ds-detail-body">
              {fieldsLoading ? (
                <EmptyState text="加载中…" />
              ) : fields.length === 0 && !fieldsError ? (
                <EmptyState text="该索引未定义任何字段" />
              ) : (
                renderFields(fields, 0)
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
