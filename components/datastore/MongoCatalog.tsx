"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  DatastoreConnection,
  MongoCollectionInfo,
  MongoDatabaseInfo,
  MongoFieldSampleResult,
  MongoIndexInfo,
} from "@/lib/datastore/types";
import { datastoreApi } from "@/components/datastore/api";
import { EmptyState, ErrorBar, FilterInput, HintBar } from "@/components/datastore/shared";

interface Props {
  conn: DatastoreConnection;
  databases: MongoDatabaseInfo[];
  databasesError: string;
  loading: boolean;
  onReload: () => void;
  collections: MongoCollectionInfo[];
  collectionsError: string;
  collectionsLoading: boolean;
  onReloadCollections: () => void;
  selectedDb: string | null;
  onSelectDb: (db: string) => void;
  selectedCollection: string | null;
  onSelectCollection: (collection: string) => void;
}

/**
 * MongoDB 目录浏览：库列表 → 集合列表（含文档数与索引数）→ 集合详情。
 * 库与集合列表由页面统一加载后下发（查询台也要用），集合详情按需懒加载。
 *
 * 详情含采样推断的字段与索引定义；字段区明确标注「采样推断」与实际采样条数，
 * 不把它当作权威 schema 呈现（文档异构，采样必然可能漏字段）。
 */
export function MongoCatalog({
  conn,
  databases,
  databasesError,
  loading,
  onReload,
  collections,
  collectionsError,
  collectionsLoading,
  onReloadCollections,
  selectedDb,
  onSelectDb,
  selectedCollection,
  onSelectCollection,
}: Props) {
  const [filter, setFilter] = useState("");

  const [sample, setSample] = useState<MongoFieldSampleResult | null>(null);
  const [indexes, setIndexes] = useState<MongoIndexInfo[]>([]);
  const [detailError, setDetailError] = useState("");
  const [detailLoading, setDetailLoading] = useState(false);

  const loadDetail = useCallback(
    async (db: string, collection: string) => {
      setDetailLoading(true);
      setDetailError("");
      const [fieldsRes, indexRes] = await Promise.all([
        datastoreApi.mongoFields(conn.id, db, collection),
        datastoreApi.mongoIndexes(conn.id, db, collection),
      ]);
      if (!fieldsRes.ok || !indexRes.ok) {
        setSample(null);
        setIndexes([]);
        setDetailError(fieldsRes.error ?? indexRes.error ?? "读取集合详情失败");
      } else {
        setSample(fieldsRes.sample ?? null);
        setIndexes(indexRes.indexes ?? []);
      }
      setDetailLoading(false);
    },
    [conn.id]
  );

  useEffect(() => {
    if (!selectedDb || !selectedCollection) {
      setSample(null);
      setIndexes([]);
      setDetailError("");
      return;
    }
    void loadDetail(selectedDb, selectedCollection);
  }, [selectedDb, selectedCollection, loadDetail]);

  const filtered = useMemo(() => {
    const kw = filter.trim().toLowerCase();
    return kw ? collections.filter((c) => c.name.toLowerCase().includes(kw)) : collections;
  }, [collections, filter]);

  return (
    <div className="ds-catalog">
      {/* 左：库 + 集合 */}
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
              <option key={d.name} value={d.name}>
                {d.name}
              </option>
            ))}
          </select>
          <button className="ds-btn-ghost-sm" onClick={onReload} disabled={loading}>
            {loading ? "加载中…" : "刷新"}
          </button>
        </div>

        <ErrorBar message={databasesError} onRetry={onReload} />

        <div className="ds-list-toolbar" style={{ marginTop: 8 }}>
          <FilterInput value={filter} onChange={setFilter} placeholder="过滤集合名…" />
        </div>

        <ErrorBar message={collectionsError} onRetry={onReloadCollections} />

        <div className="ds-list">
          {!selectedDb ? (
            <EmptyState text="先选择一个数据库" />
          ) : collectionsLoading ? (
            <EmptyState text="加载中…" />
          ) : (
            <>
              {filtered.map((c) => (
                <div
                  key={c.name}
                  className={`ds-coll-row${selectedCollection === c.name ? " active" : ""}`}
                  onClick={() => onSelectCollection(c.name)}
                >
                  <span className="ds-coll-name" title={c.name}>
                    {c.name}
                  </span>
                  <span className="ds-coll-meta">{c.docCount.toLocaleString()} 条</span>
                  <span className="ds-coll-meta">{c.indexCount} 索引</span>
                </div>
              ))}
              {!collectionsError && filtered.length === 0 && (
                <EmptyState text={collections.length === 0 ? "该库没有集合" : "无匹配的集合"} />
              )}
            </>
          )}
        </div>

        <div className="ds-list-footer">共 {filtered.length} 个集合</div>
      </div>

      {/* 右：集合详情（采样字段 + 索引） */}
      <div className="ds-detail-pane">
        {!selectedCollection ? (
          <EmptyState text="选择左侧集合查看字段与索引" />
        ) : (
          <>
            <div className="ds-detail-header">
              <span className="ds-detail-title">{selectedCollection}</span>
              <span className="ds-detail-sub">{selectedDb}</span>
            </div>

            <ErrorBar
              message={detailError}
              onRetry={
                selectedDb ? () => loadDetail(selectedDb, selectedCollection) : undefined
              }
            />

            <div className="ds-detail-body">
              {detailLoading ? (
                <EmptyState text="加载中…" />
              ) : (
                <>
                  <HintBar>
                    以下字段为采样推断结果，非权威 schema —— 本次采样 {sample?.sampled ?? 0} 条文档，
                    异构文档下可能存在未被采样到的字段
                  </HintBar>

                  {sample && sample.fields.length > 0 ? (
                    sample.fields.map((f) => (
                      <div key={f.path} className="ds-field-row-item" title={f.path}>
                        <span className="ds-caret" />
                        <span className="ds-field-name">{f.path}</span>
                        <span className="ds-field-types">
                          {f.types.map((t) => (
                            <span key={t} className="ds-field-type">
                              {t}
                            </span>
                          ))}
                        </span>
                        <span className="ds-field-count">{f.presentCount} 条出现</span>
                      </div>
                    ))
                  ) : (
                    !detailError && <EmptyState text="集合内没有文档，无法推断字段" />
                  )}

                  <div className="ds-detail-section">
                    <div className="ds-detail-section-title">索引</div>
                    {indexes.length === 0 ? (
                      <EmptyState text="没有索引" />
                    ) : (
                      indexes.map((ix) => (
                        <div key={ix.name} className="ds-field-row-item" title={ix.keys}>
                          <span className="ds-caret" />
                          <span className="ds-field-name">{ix.name}</span>
                          <span className="ds-field-count">{ix.keys}</span>
                        </div>
                      ))
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
