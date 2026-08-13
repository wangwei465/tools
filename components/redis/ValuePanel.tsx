"use client";

import { useCallback, useEffect, useState } from "react";
import type { RedisConnection, ValueResult } from "@/lib/redis/types";
import { redisApi } from "@/components/redis/api";
import {
  StringEditor,
  HashEditor,
  ListEditor,
  SetEditor,
  ZsetEditor,
  type EditorProps,
} from "@/components/redis/ValueEditors";

interface Props {
  conn: RedisConnection;
  db: number;
  keyName: string | null;
  onDeleted: () => void;
  onChanged: () => void;
}

/** TTL 展示。 */
function ttlText(ttl: number): string {
  if (ttl === -1) return "永久";
  if (ttl === -2) return "不存在";
  return `${ttl}s`;
}

/**
 * 值面板：展示选中 key 的类型化值。
 * 头部含类型、TTL 与通用操作（设置 / 移除过期、删除）；
 * 主体按类型分派到对应编辑器（五类型共用 value API，仅渲染不同）。
 */
export function ValuePanel({ conn, db, keyName, onDeleted, onChanged }: Props) {
  const [data, setData] = useState<ValueResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [ttlInput, setTtlInput] = useState("");
  const [delConfirm, setDelConfirm] = useState(false);

  const readonly = conn.mode === "readonly";

  const load = useCallback(async () => {
    if (!keyName) {
      setData(null);
      return;
    }
    setLoading(true);
    setError("");
    const r = await redisApi.getValue(conn.id, db, keyName);
    if (!r.ok) {
      setError(r.error ?? "读取失败");
      setData(null);
    } else {
      setData({
        type: r.type ?? "none",
        value: r.value ?? null,
        ttl: r.ttl ?? -2,
        total: r.total ?? 0,
        truncated: r.truncated ?? false,
      });
    }
    setLoading(false);
  }, [conn.id, db, keyName]);

  useEffect(() => {
    setDelConfirm(false);
    setTtlInput("");
    void load();
  }, [load]);

  // 编辑器写回后：重读值并通知外部刷新键列表（TTL/类型可能变化）
  const reload = useCallback(() => {
    void load();
    onChanged();
  }, [load, onChanged]);

  const setExpire = async () => {
    if (!keyName) return;
    const seconds = Number(ttlInput);
    if (!Number.isFinite(seconds) || seconds <= 0) {
      setError("请输入正整数秒数");
      return;
    }
    const r = await redisApi.writeValue(conn.id, db, { action: "expire", key: keyName, seconds });
    if (!r.ok) setError(r.error ?? "设置失败");
    else reload();
  };

  const persist = async () => {
    if (!keyName) return;
    const r = await redisApi.writeValue(conn.id, db, { action: "persist", key: keyName });
    if (!r.ok) setError(r.error ?? "操作失败");
    else reload();
  };

  const doDelete = async () => {
    if (!keyName) return;
    const r = await redisApi.writeValue(conn.id, db, { action: "del", key: keyName });
    if (!r.ok) {
      setError(r.error ?? "删除失败");
      return;
    }
    onDeleted();
  };

  if (!keyName) {
    return <div className="redis-valuepanel redis-vp-empty">← 从左侧选择一个键查看 / 编辑值</div>;
  }

  const editorProps: EditorProps | null =
    data && data.type !== "none"
      ? {
          connId: conn.id,
          db,
          keyName,
          data,
          readonly,
          onReload: reload,
          onError: setError,
        }
      : null;

  return (
    <div className="redis-valuepanel">
      <div className="redis-vp-header">
        <span className="redis-vp-key" title={keyName}>
          {keyName}
        </span>
        {data && <span className={`redis-kt kt-${data.type}`}>{data.type}</span>}
        {data && <span className="redis-vp-ttl">TTL：{ttlText(data.ttl)}</span>}
      </div>

      {readonly && <div className="redis-vp-readonly">只读模式：写操作已禁用，切换连接模式后可编辑</div>}

      <div className="redis-vp-ttlbar">
        <input
          className="redis-et-input"
          placeholder="过期秒数"
          value={ttlInput}
          type="number"
          disabled={readonly}
          onChange={(e) => setTtlInput(e.target.value)}
        />
        <button className="redis-btn-ghost-sm" disabled={readonly} onClick={setExpire}>
          设置过期
        </button>
        <button className="redis-btn-ghost-sm" disabled={readonly} onClick={persist}>
          移除过期
        </button>
        <div className="redis-header-spacer" />
        {delConfirm ? (
          <>
            <span className="redis-del-hint">确认删除该键？</span>
            <button className="redis-btn-danger-sm" onClick={doDelete}>
              删除
            </button>
            <button className="redis-btn-ghost-sm" onClick={() => setDelConfirm(false)}>
              取消
            </button>
          </>
        ) : (
          <button
            className="redis-btn-ghost-danger"
            disabled={readonly}
            onClick={() => setDelConfirm(true)}
          >
            删除键
          </button>
        )}
      </div>

      {error && <div className="redis-vp-error">{error}</div>}
      {data?.truncated && (
        <div className="redis-vp-trunc">
          元素过多，仅展示前 {Array.isArray(data.value) ? data.value.length : 0} / {data.total} 项
        </div>
      )}

      <div className="redis-vp-body">
        {loading && <div className="redis-kb-hint">加载中…</div>}
        {!loading && data?.type === "none" && (
          <div className="redis-kb-empty">键不存在或已删除</div>
        )}
        {!loading && editorProps && data && (
          <>
            {data.type === "string" && <StringEditor {...editorProps} />}
            {data.type === "hash" && <HashEditor {...editorProps} />}
            {data.type === "list" && <ListEditor {...editorProps} />}
            {data.type === "set" && <SetEditor {...editorProps} />}
            {data.type === "zset" && <ZsetEditor {...editorProps} />}
            {["stream"].includes(data.type) && (
              <div className="redis-kb-empty">暂不支持编辑 {data.type} 类型，可用命令行操作</div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
