"use client";

import { useCallback, useEffect, useState } from "react";
import type { NodeSlowlog, RedisConnection } from "@/lib/redis/types";
import { redisApi } from "@/components/redis/api";
import { ENV_META } from "@/components/redis/ConnectionBar";

interface Props {
  conn: RedisConnection;
}

/** 耗时（微秒）→ 可读（μs / ms / s）。 */
function fmtDuration(us: number): string {
  if (!Number.isFinite(us)) return "-";
  if (us < 1000) return `${us} μs`;
  if (us < 1_000_000) return `${(us / 1000).toFixed(2)} ms`;
  return `${(us / 1_000_000).toFixed(2)} s`;
}

/** 秒级时间戳 → 本地时间；非法回退 "-"。 */
function fmtTime(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return "-";
  return new Date(sec * 1000).toLocaleString();
}

/** 客户端展示：地址 (名称)；均缺失回退 "-"。 */
function fmtClient(addr?: string, name?: string): string {
  if (addr && name) return `${addr} (${name})`;
  return addr || name || "-";
}

/** 单节点慢查询卡片：按耗时从高到低展示条目。 */
function NodeSlowlogCard({ node }: { node: NodeSlowlog }) {
  const entries = [...node.entries].sort((a, b) => b.durationUs - a.durationUs);
  return (
    <div className="redis-slow-card">
      <div className="redis-slow-node">
        <span className="redis-slow-nodename">{node.node}</span>
        <span className="redis-slow-len">共 {node.len} 条</span>
      </div>
      {entries.length === 0 ? (
        <div className="redis-slow-empty">暂无慢查询记录</div>
      ) : (
        <table className="redis-slow-table">
          <thead>
            <tr>
              <th className="redis-slow-th-time">时间</th>
              <th className="redis-slow-th-dur">耗时</th>
              <th>命令</th>
              <th className="redis-slow-th-client">客户端</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => {
              const cmd = e.command.join(" ");
              return (
                <tr key={e.id}>
                  <td className="redis-slow-time">{fmtTime(e.timestamp)}</td>
                  <td className="redis-slow-dur">{fmtDuration(e.durationUs)}</td>
                  <td className="redis-slow-cmd" title={cmd}>
                    {cmd}
                  </td>
                  <td className="redis-slow-client">{fmtClient(e.clientAddr, e.clientName)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

/**
 * 慢查询面板：SLOWLOG GET/LEN 只读拉取展示（集群按主节点分栏），
 * 「清空慢日志」经二次确认（展示连接名 + 环境）执行 SLOWLOG RESET，只读模式禁用。
 */
export function SlowlogPanel({ conn }: Props) {
  const [nodes, setNodes] = useState<NodeSlowlog[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const readonly = conn.mode === "readonly";

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const r = await redisApi.getSlowlog(conn.id);
    if (!r.ok) {
      setError(r.error ?? "获取慢查询失败");
      setNodes(null);
    } else {
      setNodes(r.nodes ?? []);
    }
    setLoading(false);
  }, [conn.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const doReset = async () => {
    setConfirmOpen(false);
    const r = await redisApi.resetSlowlog(conn.id, true);
    if (!r.ok) {
      setError(r.error ?? "清空慢查询失败");
      return;
    }
    void load();
  };

  const totalLen = nodes?.reduce((sum, n) => sum + n.len, 0) ?? 0;
  const cluster = (nodes?.length ?? 0) > 1;

  return (
    <div className="redis-slowpanel">
      <div className="redis-info-toolbar">
        <span className="redis-info-caption">
          {conn.name} · 慢查询日志{cluster && `（${nodes!.length} 主节点）`}
        </span>
        <div className="redis-header-spacer" />
        <button
          className="redis-btn-ghost-danger"
          onClick={() => setConfirmOpen(true)}
          disabled={readonly || loading}
          title={readonly ? "只读模式禁止清空" : "清空慢查询日志"}
        >
          清空慢日志
        </button>
        <button className="redis-btn-ghost" onClick={load} disabled={loading}>
          {loading ? "刷新中…" : "刷新"}
        </button>
      </div>

      {readonly && <div className="redis-slow-rohint">只读模式：仅可查看，清空已禁用</div>}
      {error && <div className="redis-vp-error">{error}</div>}

      <div className="redis-slow-body">
        {nodes?.map((n) => (
          <NodeSlowlogCard key={n.node} node={n} />
        ))}
        {!loading && nodes && nodes.length === 0 && (
          <div className="redis-kb-empty">暂无慢查询记录</div>
        )}
      </div>

      {/* 清空二次确认（复用命令行同款危险确认弹窗） */}
      {confirmOpen && (
        <div className="redis-modal-mask" onClick={() => setConfirmOpen(false)}>
          <div className="redis-modal redis-confirm" onClick={(e) => e.stopPropagation()}>
            <div className="redis-modal-header">
              <span className="redis-modal-title">⚠ 危险操作确认</span>
            </div>
            <div className="redis-confirm-body">
              <p className="redis-confirm-cmd">SLOWLOG RESET</p>
              <p>
                目标连接：<b>{conn.name}</b>
                <span className={`redis-badge ${ENV_META[conn.env].cls}`}>
                  {ENV_META[conn.env].label}
                </span>
              </p>
              <p className="redis-confirm-warn">
                将清空{cluster ? "各主节点" : "该连接"}的全部慢查询日志（当前共 {totalLen} 条），此操作不可恢复。
              </p>
            </div>
            <div className="redis-confirm-actions">
              <button className="redis-btn-ghost" onClick={() => setConfirmOpen(false)}>
                取消
              </button>
              <button className="redis-btn-danger" onClick={doReset}>
                确认清空
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
