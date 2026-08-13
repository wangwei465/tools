"use client";

import { useEffect, useRef, useState } from "react";
import type { RedisConnection } from "@/lib/redis/types";
import { redisApi } from "@/components/redis/api";
import { ENV_META } from "@/components/redis/ConnectionBar";

interface Props {
  conn: RedisConnection;
  db: number;
}

/** 一条控制台记录。 */
interface Entry {
  command: string;
  ok: boolean;
  text: string;
}

/** 待确认的危险命令。 */
interface Pending {
  command: string;
  error: string;
}

/** 将 Redis 回复格式化为可读文本。 */
function formatReply(reply: unknown): string {
  if (reply === null || reply === undefined) return "(nil)";
  if (Array.isArray(reply)) {
    if (reply.length === 0) return "(empty array)";
    return reply
      .map((v, i) => `${i + 1}) ${v === null ? "(nil)" : Array.isArray(v) ? JSON.stringify(v) : String(v)}`)
      .join("\n");
  }
  if (typeof reply === "object") return JSON.stringify(reply);
  return String(reply);
}

/**
 * 命令控制台：redis-cli 式原始命令执行。
 * 结果原样回显 + 会话内命令历史（↑/↓ 回填）；
 * 危险命令二次确认（展示连接名 + 环境）；只读拦截提示。
 */
export function Console({ conn, db }: Props) {
  const [input, setInput] = useState("");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [history, setHistory] = useState<string[]>([]);
  const [histIdx, setHistIdx] = useState(-1);
  const [pending, setPending] = useState<Pending | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  // 新记录后滚到底部
  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight });
  }, [entries]);

  const append = (command: string, ok: boolean, text: string) =>
    setEntries((prev) => [...prev, { command, ok, text }]);

  const run = async (command: string, confirm = false) => {
    const r = await redisApi.exec(conn.id, db, command, confirm);
    if (r.needConfirm) {
      setPending({ command, error: r.error ?? "危险命令，请确认" });
      return;
    }
    if (!r.ok) {
      append(command, false, r.error ?? "执行失败");
      return;
    }
    append(command, true, formatReply(r.result));
  };

  const submit = () => {
    const cmd = input.trim();
    if (!cmd) return;
    setHistory((prev) => [...prev, cmd]);
    setHistIdx(-1);
    void run(cmd);
    setInput("");
  };

  // ↑/↓ 回填历史命令
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      submit();
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (history.length === 0) return;
      const idx = histIdx === -1 ? history.length - 1 : Math.max(0, histIdx - 1);
      setHistIdx(idx);
      setInput(history[idx]);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (histIdx === -1) return;
      const idx = histIdx + 1;
      if (idx >= history.length) {
        setHistIdx(-1);
        setInput("");
      } else {
        setHistIdx(idx);
        setInput(history[idx]);
      }
    }
  };

  const confirmRun = () => {
    if (!pending) return;
    void run(pending.command, true);
    setPending(null);
  };

  return (
    <div className="redis-console">
      <div className="redis-console-body" ref={bodyRef}>
        {entries.length === 0 && (
          <div className="redis-console-hint">
            输入 Redis 命令并回车执行，如 <code>GET user:1</code>、<code>HGETALL cfg</code>。↑/↓ 回填历史。
          </div>
        )}
        {entries.map((e, i) => (
          <div key={i} className="redis-console-entry">
            <div className="redis-console-cmd">
              <span className="redis-console-prompt">&gt;</span> {e.command}
            </div>
            <pre className={`redis-console-out${e.ok ? "" : " err"}`}>{e.text}</pre>
          </div>
        ))}
      </div>

      <div className="redis-console-inputbar">
        <span className="redis-console-prompt">&gt;</span>
        <input
          className="redis-console-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={conn.mode === "readonly" ? "只读模式：写命令将被拦截" : "输入命令…"}
          spellCheck={false}
          autoFocus
        />
        <button className="redis-btn-primary" onClick={submit}>
          执行
        </button>
      </div>

      {/* 危险命令二次确认 */}
      {pending && (
        <div className="redis-modal-mask" onClick={() => setPending(null)}>
          <div className="redis-modal redis-confirm" onClick={(e) => e.stopPropagation()}>
            <div className="redis-modal-header">
              <span className="redis-modal-title">⚠ 危险命令确认</span>
            </div>
            <div className="redis-confirm-body">
              <p className="redis-confirm-cmd">{pending.command}</p>
              <p>
                目标连接：<b>{conn.name}</b>
                <span className={`redis-badge ${ENV_META[conn.env].cls}`}>
                  {ENV_META[conn.env].label}
                </span>
              </p>
              <p className="redis-confirm-warn">{pending.error}</p>
            </div>
            <div className="redis-confirm-actions">
              <button className="redis-btn-ghost" onClick={() => setPending(null)}>
                取消
              </button>
              <button className="redis-btn-danger" onClick={confirmRun}>
                确认执行
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
