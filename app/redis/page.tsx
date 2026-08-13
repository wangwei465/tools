"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RedisConnection } from "@/lib/redis/types";
import { redisApi } from "@/components/redis/api";
import { ConnectionBar } from "@/components/redis/ConnectionBar";
import { ConnectionManager } from "@/components/redis/ConnectionManager";
import { KeyBrowser } from "@/components/redis/KeyBrowser";
import { ValuePanel } from "@/components/redis/ValuePanel";
import { Console } from "@/components/redis/Console";
import { MonitorPanel } from "@/components/redis/MonitorPanel";

/** 三个主视图。 */
type RedisView = "browser" | "console" | "monitor";

/**
 * Redis 管理主页面。
 * 顶部：连接选择器 + 视图切换；主体按视图渲染键浏览器 / 命令行 / 监控。
 * 连接列表与当前选中连接为页面级状态，下发给各子视图。
 */
export default function RedisPage() {
  const [connections, setConnections] = useState<RedisConnection[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [view, setView] = useState<RedisView>("browser");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [managerOpen, setManagerOpen] = useState(false);
  // 键浏览器刷新令牌：值写入 / 删除后自增以触发重扫
  const [keysToken, setKeysToken] = useState(0);
  // 当前选中的数据库（0-15）；集群忽略，恒 0
  const [db, setDb] = useState(0);
  // 记录已为哪个连接同步过默认库，避免连接列表刷新时覆盖用户手动选库
  const dbSyncedFor = useRef<number | null>(null);

  const selected = useMemo(
    () => connections.find((c) => c.id === selectedId) ?? null,
    [connections, selectedId]
  );

  const reloadConnections = useCallback(async () => {
    const list = await redisApi.listConnections();
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

  // 切换连接时选库回落到该连接配置的默认库（仅在连接真正变化时同步，集群固定 0）
  useEffect(() => {
    if (selectedId == null || dbSyncedFor.current === selectedId) return;
    dbSyncedFor.current = selectedId;
    const conn = connections.find((c) => c.id === selectedId);
    setDb(conn && conn.type !== "cluster" ? conn.db ?? 0 : 0);
  }, [selectedId, connections]);

  // 切换连接时清空选中的 key（避免跨连接残留）
  const handleSelectConn = useCallback((id: number) => {
    setSelectedId(id);
    setSelectedKey(null);
  }, []);

  // 切库：清空选中 key（键在不同库间不通用），子视图据 db 变化自动重扫 / 重读
  const handleSelectDb = useCallback((next: number) => {
    setDb(next);
    setSelectedKey(null);
  }, []);

  const bumpKeys = useCallback(() => setKeysToken((t) => t + 1), []);

  return (
    <div className="redis-page">
      <div className="redis-header">
        <h1 className="redis-title">Redis 管理</h1>
        <ConnectionBar
          connections={connections}
          selected={selected}
          db={db}
          onSelect={handleSelectConn}
          onSelectDb={handleSelectDb}
          onManage={() => setManagerOpen(true)}
        />
        <div className="redis-header-spacer" />
        <div className="redis-views">
          {(
            [
              ["browser", "键浏览"],
              ["console", "命令行"],
              ["monitor", "监控"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              className={`redis-view-tab${view === key ? " active" : ""}`}
              onClick={() => setView(key)}
              disabled={!selected}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="redis-body">
        {!selected ? (
          <div className="redis-empty">
            <p>还没有可用连接。</p>
            <button className="redis-btn-primary" onClick={() => setManagerOpen(true)}>
              + 新建连接
            </button>
          </div>
        ) : view === "browser" ? (
          <div className="redis-browser">
            <KeyBrowser
              conn={selected}
              db={db}
              refreshToken={keysToken}
              selectedKey={selectedKey}
              onSelectKey={setSelectedKey}
              onKeyDeleted={(k) => {
                if (k === selectedKey) setSelectedKey(null);
              }}
            />
            <ValuePanel
              conn={selected}
              db={db}
              keyName={selectedKey}
              onDeleted={() => {
                setSelectedKey(null);
                bumpKeys();
              }}
              onChanged={bumpKeys}
            />
          </div>
        ) : view === "console" ? (
          <Console conn={selected} db={db} />
        ) : (
          <MonitorPanel conn={selected} />
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
