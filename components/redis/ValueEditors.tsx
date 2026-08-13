"use client";

import { useEffect, useMemo, useState } from "react";
import type { FieldEntry, ValueResult, ZMember } from "@/lib/redis/types";
import { redisApi, type WriteValueInput } from "@/components/redis/api";
import { ValueDetailEditor } from "@/components/redis/ValueDetailEditor";

/** 编辑器公共 props。 */
export interface EditorProps {
  connId: number;
  db: number;
  keyName: string;
  data: ValueResult;
  readonly: boolean;
  onReload: () => void;
  onError: (msg: string) => void;
}

/** 共用写回：五种编辑器仅渲染不同，写路径统一走此函数（带运行时选库 db）。 */
async function write(
  connId: number,
  db: number,
  input: WriteValueInput,
  onReload: () => void,
  onError: (m: string) => void
): Promise<void> {
  const r = await redisApi.writeValue(connId, db, input);
  if (!r.ok) {
    onError(r.error ?? "操作失败");
    return;
  }
  onReload();
}

/* ─── string ──────────────────────────────────────────────── */

export function StringEditor({ connId, db, keyName, data, readonly, onReload, onError }: EditorProps) {
  const value = typeof data.value === "string" ? data.value : "";
  return (
    <div className="redis-editor redis-str-editor">
      <ValueDetailEditor
        key={keyName}
        value={value}
        readonly={readonly}
        onSave={(v) => write(connId, db, { action: "set", key: keyName, value: v }, onReload, onError)}
        onError={onError}
      />
    </div>
  );
}

/* ─── hash ────────────────────────────────────────────────── */

/** 字段列表行的值预览：折叠空白、截断。 */
function fieldPreview(v: string): string {
  const s = v.replace(/\s+/g, " ").trim();
  return s.length > 80 ? s.slice(0, 80) + "…" : s || "(空)";
}

/**
 * Hash 编辑器：主从布局。
 * 左（主）：可搜索字段列表 + 值预览 + 添加字段；右（从）：选中字段的完整值详情（JSON 高亮 / 美化 / 复制 / 编辑保存 / 删除）。
 * 大 hash（数百字段）可搜索定位，长 JSON 值在右侧完整查看，充分利用横向空间。
 */
export function HashEditor({ connId, db, keyName, data, readonly, onReload, onError }: EditorProps) {
  const entries = useMemo(() => (data.value as FieldEntry[]) ?? [], [data.value]);
  const [selected, setSelected] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [newField, setNewField] = useState("");
  const [adding, setAdding] = useState(false);

  // 数据 / 键变化：清搜索与新增态；选中项若仍存在则保留，否则回落到首个字段
  useEffect(() => {
    setSearch("");
    setNewField("");
    setAdding(false);
    setSelected((prev) => {
      if (prev && entries.some((e) => e.field === prev)) return prev;
      return entries[0]?.field ?? null;
    });
  }, [entries, keyName]);

  const kw = search.trim().toLowerCase();
  const filtered = kw ? entries.filter((e) => e.field.toLowerCase().includes(kw)) : entries;
  const current = entries.find((e) => e.field === selected) ?? null;

  const addField = () => {
    const f = newField.trim();
    if (!f) return;
    // 新字段以空值创建，随即选中以在右侧编辑其值
    write(connId, db, { action: "hset", key: keyName, field: f, value: "" }, onReload, onError);
    setSelected(f);
    setNewField("");
    setAdding(false);
  };

  return (
    <div className="redis-hash">
      {/* 主：字段列表 */}
      <div className="redis-hash-master">
        <div className="redis-hash-search">
          <input
            className="redis-hash-searchinput"
            placeholder="搜索字段…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <span className="redis-hash-count">
            {kw ? `${filtered.length}/${entries.length}` : entries.length}
          </span>
        </div>

        <div className="redis-hash-fieldlist">
          {filtered.map((e) => (
            <div
              key={e.field}
              className={`redis-hash-fielditem${selected === e.field ? " active" : ""}`}
              onClick={() => setSelected(e.field)}
              title={e.field}
            >
              <span className="redis-hash-fieldname">{e.field}</span>
              <span className="redis-hash-fieldpreview">{fieldPreview(e.value)}</span>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="redis-kb-empty">{entries.length === 0 ? "空 hash" : "无匹配字段"}</div>
          )}
        </div>

        {!readonly && (
          <div className="redis-hash-add">
            {adding ? (
              <>
                <input
                  className="redis-hash-searchinput"
                  placeholder="新字段名"
                  value={newField}
                  autoFocus
                  onChange={(e) => setNewField(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") addField();
                    if (e.key === "Escape") {
                      setAdding(false);
                      setNewField("");
                    }
                  }}
                />
                <button className="redis-btn-primary-sm" disabled={!newField.trim()} onClick={addField}>
                  创建
                </button>
                <button
                  className="redis-btn-ghost-sm"
                  onClick={() => {
                    setAdding(false);
                    setNewField("");
                  }}
                >
                  取消
                </button>
              </>
            ) : (
              <button className="redis-btn-ghost" onClick={() => setAdding(true)}>
                + 添加字段
              </button>
            )}
          </div>
        )}
      </div>

      {/* 从：值详情 */}
      <div className="redis-hash-detail">
        {current ? (
          <ValueDetailEditor
            key={current.field}
            value={current.value}
            readonly={readonly}
            onSave={(v) =>
              write(connId, db, { action: "hset", key: keyName, field: current.field, value: v }, onReload, onError)
            }
            onError={onError}
            headerLeft={
              <span className="redis-vd-field" title={current.field}>
                {current.field}
              </span>
            }
            headerActions={
              readonly ? null : (
                <button
                  className="redis-btn-danger-sm"
                  onClick={() =>
                    write(connId, db, { action: "hdel", key: keyName, field: current.field }, onReload, onError)
                  }
                >
                  删除字段
                </button>
              )
            }
          />
        ) : (
          <div className="redis-hash-detail-empty">← 选择左侧字段查看 / 编辑值</div>
        )}
      </div>
    </div>
  );
}

/* ─── list ────────────────────────────────────────────────── */

export function ListEditor({ connId, db, keyName, data, readonly, onReload, onError }: EditorProps) {
  const items = (data.value as string[]) ?? [];
  const [edits, setEdits] = useState<Record<number, string>>({});
  const [pushVal, setPushVal] = useState("");

  useEffect(() => {
    setEdits({});
    setPushVal("");
  }, [data, keyName]);

  return (
    <div className="redis-editor">
      {!readonly && (
        <div className="redis-add-row">
          <input
            className="redis-et-input"
            placeholder="元素值"
            value={pushVal}
            onChange={(e) => setPushVal(e.target.value)}
          />
          <button
            className="redis-btn-ghost"
            onClick={() =>
              write(connId, db, { action: "lpush", key: keyName, value: pushVal }, onReload, onError)
            }
          >
            ← 头部插入
          </button>
          <button
            className="redis-btn-ghost"
            onClick={() =>
              write(connId, db, { action: "rpush", key: keyName, value: pushVal }, onReload, onError)
            }
          >
            尾部插入 →
          </button>
          <button
            className="redis-btn-ghost-sm"
            onClick={() => write(connId, db, { action: "lpop", key: keyName }, onReload, onError)}
          >
            弹出头部
          </button>
          <button
            className="redis-btn-ghost-sm"
            onClick={() => write(connId, db, { action: "rpop", key: keyName }, onReload, onError)}
          >
            弹出尾部
          </button>
        </div>
      )}

      <table className="redis-entry-table">
        <thead>
          <tr>
            <th className="redis-et-idx">#</th>
            <th>值</th>
            <th className="redis-et-act" />
          </tr>
        </thead>
        <tbody>
          {items.map((v, i) => {
            const cur = edits[i] ?? v;
            const dirty = cur !== v;
            return (
              <tr key={i}>
                <td className="redis-et-idx">{i}</td>
                <td>
                  <input
                    className="redis-et-input"
                    value={cur}
                    readOnly={readonly}
                    onChange={(ev) => setEdits((m) => ({ ...m, [i]: ev.target.value }))}
                  />
                </td>
                <td className="redis-et-act">
                  <button
                    className="redis-btn-primary-sm"
                    disabled={readonly || !dirty}
                    onClick={() =>
                      write(
                        connId,
                        db,
                        { action: "lset", key: keyName, index: i, value: cur },
                        onReload,
                        onError
                      )
                    }
                  >
                    保存
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ─── set ─────────────────────────────────────────────────── */

export function SetEditor({ connId, db, keyName, data, readonly, onReload, onError }: EditorProps) {
  const members = (data.value as string[]) ?? [];
  const [newMember, setNewMember] = useState("");

  useEffect(() => {
    setNewMember("");
  }, [data, keyName]);

  return (
    <div className="redis-editor">
      {!readonly && (
        <div className="redis-add-row">
          <input
            className="redis-et-input"
            placeholder="新成员"
            value={newMember}
            onChange={(e) => setNewMember(e.target.value)}
          />
          <button
            className="redis-btn-ghost"
            disabled={!newMember.trim()}
            onClick={() =>
              write(connId, db, { action: "sadd", key: keyName, member: newMember }, onReload, onError)
            }
          >
            + 添加成员
          </button>
        </div>
      )}

      <table className="redis-entry-table">
        <thead>
          <tr>
            <th>成员</th>
            <th className="redis-et-act" />
          </tr>
        </thead>
        <tbody>
          {members.map((m) => (
            <tr key={m}>
              <td className="redis-et-field" title={m}>
                {m}
              </td>
              <td className="redis-et-act">
                <button
                  className="redis-btn-danger-sm"
                  disabled={readonly}
                  onClick={() =>
                    write(connId, db, { action: "srem", key: keyName, member: m }, onReload, onError)
                  }
                >
                  删
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ─── zset ────────────────────────────────────────────────── */

export function ZsetEditor({ connId, db, keyName, data, readonly, onReload, onError }: EditorProps) {
  const members = (data.value as ZMember[]) ?? [];
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [newMember, setNewMember] = useState("");
  const [newScore, setNewScore] = useState("0");

  useEffect(() => {
    setEdits({});
    setNewMember("");
    setNewScore("0");
  }, [data, keyName]);

  return (
    <div className="redis-editor">
      {!readonly && (
        <div className="redis-add-row">
          <input
            className="redis-et-input"
            placeholder="成员"
            value={newMember}
            onChange={(e) => setNewMember(e.target.value)}
          />
          <input
            className="redis-et-score"
            type="number"
            placeholder="分数"
            value={newScore}
            onChange={(e) => setNewScore(e.target.value)}
          />
          <button
            className="redis-btn-ghost"
            disabled={!newMember.trim()}
            onClick={() =>
              write(
                connId,
                db,
                { action: "zadd", key: keyName, member: newMember, score: Number(newScore) },
                onReload,
                onError
              )
            }
          >
            + 添加成员
          </button>
        </div>
      )}

      <table className="redis-entry-table">
        <thead>
          <tr>
            <th>成员</th>
            <th className="redis-et-score-col">分数</th>
            <th className="redis-et-act" />
          </tr>
        </thead>
        <tbody>
          {members.map((z) => {
            const cur = edits[z.member] ?? String(z.score);
            const dirty = cur !== String(z.score);
            return (
              <tr key={z.member}>
                <td className="redis-et-field" title={z.member}>
                  {z.member}
                </td>
                <td>
                  <input
                    className="redis-et-score"
                    type="number"
                    value={cur}
                    readOnly={readonly}
                    onChange={(e) => setEdits((m) => ({ ...m, [z.member]: e.target.value }))}
                  />
                </td>
                <td className="redis-et-act">
                  <button
                    className="redis-btn-primary-sm"
                    disabled={readonly || !dirty}
                    onClick={() =>
                      write(
                        connId,
                        db,
                        { action: "zadd", key: keyName, member: z.member, score: Number(cur) },
                        onReload,
                        onError
                      )
                    }
                  >
                    保存
                  </button>
                  <button
                    className="redis-btn-danger-sm"
                    disabled={readonly}
                    onClick={() =>
                      write(connId, db, { action: "zrem", key: keyName, member: z.member }, onReload, onError)
                    }
                  >
                    删
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
