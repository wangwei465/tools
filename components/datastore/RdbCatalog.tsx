"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  DatastoreConnection,
  RdbTableDetail,
  RdbTableInfo,
} from "@/lib/datastore/types";
import { datastoreApi } from "@/components/datastore/api";
import { EmptyState, ErrorBar, FilterInput, HintBar } from "@/components/datastore/shared";

interface Props {
  conn: DatastoreConnection;
  databases: string[];
  databasesError: string;
  loading: boolean;
  onReload: () => void;
  selectedDb: string | null;
  onSelectDb: (db: string) => void;
  selectedSchema: string | null;
  onSelectSchema: (schema: string) => void;
}

/**
 * 关系型目录浏览：库 → schema → 表/视图 → 列与索引。
 *
 * MySQL 的 schema 与 database 是同一层，服务端已折叠为与库同名的单元素，
 * 故这里隐藏 schema 下拉；PostgreSQL 正常展示三级。
 *
 * 按层懒加载：进来只拉库列表，选库才拉 schema，选 schema 才拉表，
 * 展开某张表才查它的列与索引——`information_schema` 在大库上很慢，
 * 一次性拉全量会让进入工具就卡住。
 */
export function RdbCatalog({
  conn,
  databases,
  databasesError,
  loading,
  onReload,
  selectedDb,
  onSelectDb,
  selectedSchema,
  onSelectSchema,
}: Props) {
  const isPg = conn.type === "postgres";

  const [schemas, setSchemas] = useState<string[]>([]);
  const [schemasError, setSchemasError] = useState("");
  const [schemasLoading, setSchemasLoading] = useState(false);

  const [tables, setTables] = useState<RdbTableInfo[]>([]);
  const [tablesError, setTablesError] = useState("");
  const [tablesLoading, setTablesLoading] = useState(false);
  const [filter, setFilter] = useState("");

  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [detail, setDetail] = useState<RdbTableDetail | null>(null);
  const [detailError, setDetailError] = useState("");
  const [detailLoading, setDetailLoading] = useState(false);

  const loadSchemas = useCallback(async () => {
    if (!selectedDb) return;
    setSchemasLoading(true);
    setSchemasError("");
    const r = await datastoreApi.rdbSchemas(conn.id, selectedDb);
    if (r.ok) setSchemas(r.schemas ?? []);
    else {
      setSchemas([]);
      setSchemasError(r.error ?? "读取 schema 列表失败");
    }
    setSchemasLoading(false);
  }, [conn.id, selectedDb]);

  const loadTables = useCallback(async () => {
    if (!selectedDb || !selectedSchema) return;
    setTablesLoading(true);
    setTablesError("");
    const r = await datastoreApi.rdbTables(conn.id, selectedDb, selectedSchema);
    if (r.ok) setTables(r.tables ?? []);
    else {
      setTables([]);
      setTablesError(r.error ?? "读取表列表失败");
    }
    setTablesLoading(false);
  }, [conn.id, selectedDb, selectedSchema]);

  const loadDetail = useCallback(
    async (table: string) => {
      if (!selectedDb || !selectedSchema) return;
      setDetailLoading(true);
      setDetailError("");
      const r = await datastoreApi.rdbTable(conn.id, selectedDb, selectedSchema, table);
      if (r.ok) setDetail(r.detail ?? null);
      else {
        setDetail(null);
        setDetailError(r.error ?? "读取表结构失败");
      }
      setDetailLoading(false);
    },
    [conn.id, selectedDb, selectedSchema]
  );

  // 切库：schema 列表重拉；MySQL 下服务端只回一个与库同名的 schema，自动选中
  useEffect(() => {
    setSchemas([]);
    setSchemasError("");
    void loadSchemas();
  }, [loadSchemas]);

  useEffect(() => {
    if (!isPg && schemas.length === 1 && schemas[0] !== selectedSchema) {
      onSelectSchema(schemas[0]);
    }
  }, [isPg, schemas, selectedSchema, onSelectSchema]);

  // 切 schema：表列表重拉，表选择清空（表在不同 schema 间不通用）
  useEffect(() => {
    setSelectedTable(null);
    setDetail(null);
    setDetailError("");
    setTables([]);
    setTablesError("");
    void loadTables();
  }, [loadTables]);

  const filtered = useMemo(() => {
    const kw = filter.trim().toLowerCase();
    return kw ? tables.filter((t) => t.name.toLowerCase().includes(kw)) : tables;
  }, [tables, filter]);

  const selectTable = (name: string) => {
    setSelectedTable(name);
    void loadDetail(name);
  };

  return (
    <div className="ds-catalog">
      {/* 左：库 / schema / 表 */}
      <div className="ds-list-pane">
        <div className="ds-list-toolbar">
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
          <button className="ds-btn-ghost-sm" onClick={onReload} disabled={loading}>
            {loading ? "加载中…" : "刷新"}
          </button>
        </div>

        <ErrorBar message={databasesError} onRetry={onReload} />

        {/* PG 的连接绑定单个库，无法跨库查询——说明而不是给一个无效的切库入口 */}
        {isPg && (
          <HintBar>PostgreSQL 连接绑定单个库，切换库需另建一个连接</HintBar>
        )}

        {/* MySQL 的 schema 与库同一层，隐藏该层 */}
        {isPg && (
          <div className="ds-list-toolbar" style={{ marginTop: 8 }}>
            <select
              className="ds-conn-select"
              value={selectedSchema ?? ""}
              onChange={(e) => onSelectSchema(e.target.value)}
              title="schema"
              disabled={schemasLoading || !selectedDb}
            >
              <option value="">（选择 schema）</option>
              {schemas.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        )}

        <ErrorBar message={schemasError} onRetry={loadSchemas} />

        <div className="ds-list-toolbar" style={{ marginTop: 8 }}>
          <FilterInput value={filter} onChange={setFilter} placeholder="过滤表名…" />
        </div>

        <ErrorBar message={tablesError} onRetry={loadTables} />

        <div className="ds-list">
          {!selectedDb ? (
            <EmptyState text="先选择一个数据库" />
          ) : !selectedSchema ? (
            <EmptyState text={schemasLoading ? "加载中…" : "先选择一个 schema"} />
          ) : tablesLoading ? (
            <EmptyState text="加载中…" />
          ) : (
            <>
              {filtered.map((t) => (
                <div
                  key={t.name}
                  className={`ds-coll-row${selectedTable === t.name ? " active" : ""}`}
                  onClick={() => selectTable(t.name)}
                >
                  <span className={`ds-rdb-kind ${t.type}`}>
                    {t.type === "view" ? "视图" : "表"}
                  </span>
                  <span className="ds-coll-name" title={t.comment || t.name}>
                    {t.name}
                  </span>
                  <span className="ds-coll-meta">
                    {t.rowCount == null ? "行数未知" : `≈${t.rowCount.toLocaleString()} 行`}
                  </span>
                </div>
              ))}
              {!tablesError && filtered.length === 0 && (
                <EmptyState text={tables.length === 0 ? "该 schema 下没有表" : "无匹配的表"} />
              )}
            </>
          )}
        </div>

        <div className="ds-list-footer">共 {filtered.length} 张表 / 视图</div>
      </div>

      {/* 右：表结构（列 + 索引） */}
      <div className="ds-detail-pane">
        {!selectedTable ? (
          <EmptyState text="选择左侧表查看列结构与索引" />
        ) : (
          <>
            <div className="ds-detail-header">
              <span className="ds-detail-title">{selectedTable}</span>
              <span className="ds-detail-sub">
                {selectedDb}
                {isPg && selectedSchema ? `.${selectedSchema}` : ""}
              </span>
            </div>

            <ErrorBar message={detailError} onRetry={() => void loadDetail(selectedTable)} />

            <div className="ds-detail-body">
              {detailLoading ? (
                <EmptyState text="加载中…" />
              ) : (
                <>
                  <div className="ds-detail-section-title">列</div>
                  {detail && detail.columns.length > 0 ? (
                    <table className="ds-table ds-rdb-cols">
                      <thead>
                        <tr>
                          <th>列名</th>
                          <th>类型</th>
                          <th>可空</th>
                          <th>默认值</th>
                          <th>注释</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.columns.map((c) => (
                          <tr key={c.name}>
                            <td>
                              {c.primaryKey && <span className="ds-rdb-pk">PK</span>}
                              <span className="ds-field-name">{c.name}</span>
                            </td>
                            <td>{c.dataType}</td>
                            <td>{c.nullable ? "是" : "否"}</td>
                            <td>
                              {c.defaultValue === null ? (
                                <span className="ds-cell-null">NULL</span>
                              ) : (
                                c.defaultValue
                              )}
                            </td>
                            <td>{c.comment}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    !detailError && <EmptyState text="没有列信息" />
                  )}

                  <div className="ds-detail-section">
                    <div className="ds-detail-section-title">索引</div>
                    {detail && detail.indexes.length > 0 ? (
                      detail.indexes.map((ix) => (
                        <div key={ix.name} className="ds-field-row-item">
                          <span className="ds-caret" />
                          <span className="ds-field-name">{ix.name}</span>
                          {ix.unique && <span className="ds-field-type">唯一</span>}
                          <span className="ds-field-count">{ix.columns.join(", ")}</span>
                        </div>
                      ))
                    ) : (
                      <EmptyState text="没有索引" />
                    )}
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
