"use client";

import { useCallback, useEffect, useState } from "react";
import type { NodeInfo, RedisConnection } from "@/lib/redis/types";
import { redisApi } from "@/components/redis/api";

interface Props {
  conn: RedisConnection;
}

/** 从分区取值，缺失回退 "-"。 */
function get(sections: NodeInfo["sections"], section: string, key: string): string {
  return sections[section]?.[key] ?? "-";
}

/** 运行时长（秒）格式化。 */
function fmtUptime(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return "-";
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d}天 ${h}小时`;
  if (h > 0) return `${h}小时 ${m}分`;
  return `${m}分`;
}

/** 命中率 = hits /(hits + misses)。 */
function hitRate(sections: NodeInfo["sections"]): string {
  const hits = Number(get(sections, "stats", "keyspace_hits"));
  const misses = Number(get(sections, "stats", "keyspace_misses"));
  const total = hits + misses;
  if (!Number.isFinite(total) || total <= 0) return "-";
  return `${((hits / total) * 100).toFixed(1)}%`;
}

/** 解析 keyspace 分区：db0 → keys=..,expires=.. 。 */
function parseKeyspace(sections: NodeInfo["sections"]): Array<{ db: string; keys: string; expires: string }> {
  const ks = sections.keyspace ?? {};
  return Object.entries(ks).map(([db, v]) => ({
    db,
    keys: /keys=(\d+)/.exec(v)?.[1] ?? "0",
    expires: /expires=(\d+)/.exec(v)?.[1] ?? "0",
  }));
}

/** 单节点指标卡片。 */
function NodeCard({ info }: { info: NodeInfo }) {
  const s = info.sections;
  const metrics: Array<[string, string]> = [
    ["版本", get(s, "server", "redis_version")],
    ["运行时长", fmtUptime(Number(get(s, "server", "uptime_in_seconds")))],
    ["客户端连接", get(s, "clients", "connected_clients")],
    ["内存占用", get(s, "memory", "used_memory_human")],
    ["ops/s", get(s, "stats", "instantaneous_ops_per_sec")],
    ["命中率", hitRate(s)],
    ["角色", get(s, "replication", "role")],
    ["从节点数", get(s, "replication", "connected_slaves")],
  ];
  const keyspace = parseKeyspace(s);

  return (
    <div className="redis-info-card">
      <div className="redis-info-node">{info.node}</div>
      <div className="redis-info-grid">
        {metrics.map(([label, value]) => (
          <div key={label} className="redis-metric">
            <div className="redis-metric-label">{label}</div>
            <div className="redis-metric-value">{value}</div>
          </div>
        ))}
      </div>

      <div className="redis-info-ks-title">键空间</div>
      {keyspace.length === 0 ? (
        <div className="redis-info-ks-empty">无数据</div>
      ) : (
        <table className="redis-info-ks">
          <thead>
            <tr>
              <th>DB</th>
              <th>键数</th>
              <th>带过期</th>
            </tr>
          </thead>
          <tbody>
            {keyspace.map((k) => (
              <tr key={k.db}>
                <td>{k.db}</td>
                <td>{k.keys}</td>
                <td>{k.expires}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/**
 * INFO 监控面板：解析 INFO 分区展示关键指标 + 键空间概览。
 * 手动刷新；集群模式按主节点分栏展示。纯只读。
 */
export function InfoPanel({ conn }: Props) {
  const [nodes, setNodes] = useState<NodeInfo[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const r = await redisApi.getInfo(conn.id);
    if (!r.ok) {
      setError(r.error ?? "获取 INFO 失败");
      setNodes(null);
    } else {
      setNodes(r.nodes ?? []);
    }
    setLoading(false);
  }, [conn.id]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="redis-infopanel">
      <div className="redis-info-toolbar">
        <span className="redis-info-caption">
          {conn.name} · INFO 监控
          {nodes && nodes.length > 1 && `（${nodes.length} 主节点）`}
        </span>
        <div className="redis-header-spacer" />
        <button className="redis-btn-ghost" onClick={load} disabled={loading}>
          {loading ? "刷新中…" : "刷新"}
        </button>
      </div>

      {error && <div className="redis-vp-error">{error}</div>}

      <div className="redis-info-body">
        {nodes?.map((n) => (
          <NodeCard key={n.node} info={n} />
        ))}
        {!loading && nodes && nodes.length === 0 && (
          <div className="redis-kb-empty">无 INFO 数据</div>
        )}
      </div>
    </div>
  );
}
