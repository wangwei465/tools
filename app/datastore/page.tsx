"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  DatastoreConnection,
  EsIndexInfo,
  MongoCollectionInfo,
  MongoDatabaseInfo,
} from "@/lib/datastore/types";
import { datastoreApi } from "@/components/datastore/api";
import { ConnectionBar } from "@/components/datastore/ConnectionBar";
import { ConnectionManager } from "@/components/datastore/ConnectionManager";
import { EsCatalog } from "@/components/datastore/EsCatalog";
import { EsConsole } from "@/components/datastore/EsConsole";
import { MongoCatalog } from "@/components/datastore/MongoCatalog";
import { MongoConsole } from "@/components/datastore/MongoConsole";

/** 两个主视图（两类数据源共用同一组切换）。 */
type DatastoreView = "catalog" | "console";

/**
 * 数据源主页面（Elasticsearch / MongoDB）。
 * 顶部：连接选择器 + 视图切换；主体按连接类型渲染 ES 或 Mongo 面板。
 *
 * 索引列表 / 库表选择是目录浏览与查询台的共享状态，故提升到页面层统一持有，
 * 避免两个视图各拉一份（与 app/redis/page.tsx 持有连接列表同理）。
 */
export default function DatastorePage() {
  const [connections, setConnections] = useState<DatastoreConnection[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [view, setView] = useState<DatastoreView>("catalog");
  const [managerOpen, setManagerOpen] = useState(false);

  // ES 侧共享状态
  const [indices, setIndices] = useState<EsIndexInfo[]>([]);
  const [indicesError, setIndicesError] = useState("");
  const [indicesLoading, setIndicesLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState<string | null>(null);

  // Mongo 侧共享状态
  const [databases, setDatabases] = useState<MongoDatabaseInfo[]>([]);
  const [databasesError, setDatabasesError] = useState("");
  const [databasesLoading, setDatabasesLoading] = useState(false);
  const [selectedDb, setSelectedDb] = useState<string | null>(null);
  const [collections, setCollections] = useState<MongoCollectionInfo[]>([]);
  const [collectionsError, setCollectionsError] = useState("");
  const [collectionsLoading, setCollectionsLoading] = useState(false);
  const [selectedCollection, setSelectedCollection] = useState<string | null>(null);

  const selected = useMemo(
    () => connections.find((c) => c.id === selectedId) ?? null,
    [connections, selectedId]
  );

  const reloadConnections = useCallback(async () => {
    const list = await datastoreApi.listConnections();
    setConnections(list);
    // 选中项失效时回退到首个连接
    setSelectedId((prev) => {
      if (prev != null && list.some((c) => c.id === prev)) return prev;
      return list[0]?.id ?? null;
    });
    return list;
  }, []);

  useEffect(() => {
    void reloadConnections();
  }, [reloadConnections]);

  const loadIndices = useCallback(async () => {
    if (!selected || selected.type !== "es") return;
    setIndicesLoading(true);
    setIndicesError("");
    const r = await datastoreApi.esIndices(selected.id);
    if (r.ok) setIndices(r.indices ?? []);
    else {
      setIndices([]);
      setIndicesError(r.error ?? "读取索引列表失败");
    }
    setIndicesLoading(false);
  }, [selected]);

  const loadDatabases = useCallback(async () => {
    if (!selected || selected.type !== "mongo") return;
    setDatabasesLoading(true);
    setDatabasesError("");
    const r = await datastoreApi.mongoDatabases(selected.id);
    if (r.ok) setDatabases(r.databases ?? []);
    else {
      setDatabases([]);
      setDatabasesError(r.error ?? "读取数据库列表失败");
    }
    setDatabasesLoading(false);
  }, [selected]);

  const loadCollections = useCallback(async () => {
    if (!selected || selected.type !== "mongo" || !selectedDb) return;
    setCollectionsLoading(true);
    setCollectionsError("");
    const r = await datastoreApi.mongoCollections(selected.id, selectedDb);
    if (r.ok) setCollections(r.collections ?? []);
    else {
      setCollections([]);
      setCollectionsError(r.error ?? "读取集合列表失败");
    }
    setCollectionsLoading(false);
  }, [selected, selectedDb]);

  // 切换连接：清空跨连接不通用的选择，按类型重新拉目录
  useEffect(() => {
    setSelectedIndex(null);
    setIndices([]);
    setIndicesError("");
    setSelectedDb(null);
    setSelectedCollection(null);
    setDatabases([]);
    setDatabasesError("");
    void loadIndices();
    void loadDatabases();
  }, [loadIndices, loadDatabases]);

  // 切库：集合列表随之重拉，集合选择清空（集合在不同库间不通用）
  useEffect(() => {
    setSelectedCollection(null);
    setCollections([]);
    setCollectionsError("");
    void loadCollections();
  }, [loadCollections]);

  const dbNames = useMemo(() => databases.map((d) => d.name), [databases]);

  const handleSelectConn = useCallback((id: number) => setSelectedId(id), []);

  return (
    <div className="ds-page">
      <div className="ds-header">
        <h1 className="ds-title">数据源</h1>
        <ConnectionBar
          connections={connections}
          selected={selected}
          onSelect={handleSelectConn}
          onManage={() => setManagerOpen(true)}
        />
        <div className="ds-spacer" />
        <div className="ds-views">
          {(
            [
              ["catalog", "目录浏览"],
              ["console", "查询台"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              className={`ds-view-tab${view === key ? " active" : ""}`}
              onClick={() => setView(key)}
              disabled={!selected}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="ds-body">
        {!selected ? (
          <div className="ds-empty">
            <p>还没有可用连接。</p>
            <button className="ds-btn-primary" onClick={() => setManagerOpen(true)}>
              + 新建连接
            </button>
          </div>
        ) : selected.type === "es" ? (
          view === "catalog" ? (
            <EsCatalog
              conn={selected}
              indices={indices}
              indicesError={indicesError}
              loading={indicesLoading}
              onReload={loadIndices}
              selectedIndex={selectedIndex}
              onSelectIndex={setSelectedIndex}
            />
          ) : (
            <EsConsole
              conn={selected}
              indices={indices}
              selectedIndex={selectedIndex}
              onSelectIndex={setSelectedIndex}
            />
          )
        ) : view === "catalog" ? (
          <MongoCatalog
            conn={selected}
            databases={databases}
            databasesError={databasesError}
            loading={databasesLoading}
            onReload={loadDatabases}
            collections={collections}
            collectionsError={collectionsError}
            collectionsLoading={collectionsLoading}
            onReloadCollections={loadCollections}
            selectedDb={selectedDb}
            onSelectDb={setSelectedDb}
            selectedCollection={selectedCollection}
            onSelectCollection={setSelectedCollection}
          />
        ) : (
          <MongoConsole
            conn={selected}
            databases={dbNames}
            collections={collections}
            selectedDb={selectedDb}
            onSelectDb={setSelectedDb}
            selectedCollection={selectedCollection}
            onSelectCollection={setSelectedCollection}
          />
        )}
      </div>

      <ConnectionManager
        open={managerOpen}
        connections={connections}
        onClose={() => setManagerOpen(false)}
        onChanged={reloadConnections}
      />
    </div>
  );
}
