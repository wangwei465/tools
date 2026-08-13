"use client";

import { useEffect, useState } from "react";
import type {
  RedisConnection,
  RedisConnectionInput,
  RedisConnType,
  RedisEnv,
  RedisMode,
  RedisNode,
} from "@/lib/redis/types";
import { redisApi } from "@/components/redis/api";
import { ENV_META, TYPE_LABEL } from "@/components/redis/ConnectionBar";

interface Props {
  open: boolean;
  connections: RedisConnection[];
  onClose: () => void;
  onChanged: () => Promise<RedisConnection[]> | void;
}

/** 表单状态：id 为 null 表示新建。 */
interface FormState {
  id: number | null;
  name: string;
  type: RedisConnType;
  nodes: RedisNode[];
  masterName: string;
  password: string;
  db: number;
  env: RedisEnv;
  mode: RedisMode;
}

const BLANK: FormState = {
  id: null,
  name: "",
  type: "standalone",
  nodes: [{ host: "127.0.0.1", port: 6379 }],
  masterName: "mymaster",
  password: "",
  db: 0,
  env: "local",
  mode: "rw",
};

function connToForm(c: RedisConnection): FormState {
  return {
    id: c.id,
    name: c.name,
    type: c.type,
    nodes: c.nodes.length ? c.nodes : [{ host: "127.0.0.1", port: 6379 }],
    masterName: c.masterName || "mymaster",
    password: c.password,
    db: c.db,
    env: c.env,
    mode: c.mode,
  };
}

function toInput(f: FormState): RedisConnectionInput {
  return {
    name: f.name,
    type: f.type,
    nodes: f.type === "standalone" ? f.nodes.slice(0, 1) : f.nodes,
    masterName: f.masterName,
    password: f.password,
    db: f.db,
    env: f.env,
    mode: f.mode,
  };
}

/**
 * 连接管理弹窗：左侧连接列表，右侧编辑表单。
 * 类型选择驱动不同节点输入（单机单节点 / 集群多节点 / 哨兵多节点 + master 名）。
 * 支持测试连接、新建 / 保存 / 删除。
 */
export function ConnectionManager({ open, connections, onClose, onChanged }: Props) {
  const [form, setForm] = useState<FormState>(BLANK);
  const [error, setError] = useState("");
  const [testMsg, setTestMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);

  // 打开时重置为新建态
  useEffect(() => {
    if (open) {
      setForm(BLANK);
      setError("");
      setTestMsg(null);
      setConfirmDel(false);
    }
  }, [open]);

  if (!open) return null;

  const patch = (p: Partial<FormState>) => {
    setForm((f) => ({ ...f, ...p }));
    setTestMsg(null);
  };

  const selectConn = (c: RedisConnection) => {
    setForm(connToForm(c));
    setError("");
    setTestMsg(null);
    setConfirmDel(false);
  };

  const newConn = () => {
    setForm(BLANK);
    setError("");
    setTestMsg(null);
    setConfirmDel(false);
  };

  // 类型切换：单机收敛为单节点
  const changeType = (type: RedisConnType) => {
    setForm((f) => ({
      ...f,
      type,
      nodes: type === "standalone" ? f.nodes.slice(0, 1) : f.nodes,
    }));
    setTestMsg(null);
  };

  // 环境切换：切到生产时自动置只读（可再手动改回）
  const changeEnv = (env: RedisEnv) => {
    setForm((f) => ({ ...f, env, mode: env === "prod" ? "readonly" : f.mode }));
    setTestMsg(null);
  };

  const updateNode = (i: number, p: Partial<RedisNode>) =>
    setForm((f) => ({
      ...f,
      nodes: f.nodes.map((n, idx) => (idx === i ? { ...n, ...p } : n)),
    }));
  const addNode = () =>
    setForm((f) => ({ ...f, nodes: [...f.nodes, { host: "127.0.0.1", port: 6379 }] }));
  const removeNode = (i: number) =>
    setForm((f) => ({ ...f, nodes: f.nodes.filter((_, idx) => idx !== i) }));

  const doTest = async () => {
    setTesting(true);
    setTestMsg(null);
    try {
      const r = await redisApi.testConnection(toInput(form));
      setTestMsg(
        r.ok
          ? { ok: true, text: `连接成功（${r.latencyMs ?? "?"}ms）` }
          : { ok: false, text: r.error ?? "连接失败" }
      );
    } finally {
      setTesting(false);
    }
  };

  const doSave = async () => {
    if (!form.name.trim()) {
      setError("连接名称不能为空");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const input = toInput(form);
      const r =
        form.id == null
          ? await redisApi.createConnection(input)
          : await redisApi.updateConnection(form.id, input);
      if (!r.ok) {
        setError(r.error ?? "保存失败");
        return;
      }
      await onChanged();
      if (r.connection) selectConn(r.connection);
    } finally {
      setSaving(false);
    }
  };

  const doDelete = async () => {
    if (form.id == null) return;
    await redisApi.deleteConnection(form.id);
    await onChanged();
    newConn();
  };

  const isCluster = form.type === "cluster";
  const isSentinel = form.type === "sentinel";
  const multiNode = isCluster || isSentinel;

  return (
    <div className="redis-modal-mask" onClick={onClose}>
      <div className="redis-modal redis-connmgr" onClick={(e) => e.stopPropagation()}>
        <div className="redis-modal-header">
          <span className="redis-modal-title">连接管理</span>
          <button className="redis-modal-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="redis-connmgr-body">
          {/* 左：连接列表 */}
          <div className="redis-connmgr-list">
            <button className="redis-connmgr-new" onClick={newConn}>
              + 新建连接
            </button>
            {connections.map((c) => (
              <div
                key={c.id}
                className={`redis-connmgr-item${form.id === c.id ? " active" : ""}`}
                onClick={() => selectConn(c)}
              >
                <span className="redis-connmgr-name">{c.name}</span>
                <span className={`redis-badge ${ENV_META[c.env].cls}`}>
                  {ENV_META[c.env].label}
                </span>
              </div>
            ))}
            {connections.length === 0 && <div className="redis-connmgr-empty">暂无连接</div>}
          </div>

          {/* 右：编辑表单 */}
          <div className="redis-connmgr-form">
            <div className="redis-field">
              <label>连接名称</label>
              <input
                value={form.name}
                onChange={(e) => patch({ name: e.target.value })}
                placeholder="如 local-cache / prod-session"
              />
            </div>

            <div className="redis-field-row">
              <div className="redis-field">
                <label>类型</label>
                <select
                  value={form.type}
                  onChange={(e) => changeType(e.target.value as RedisConnType)}
                >
                  {(["standalone", "cluster", "sentinel"] as const).map((t) => (
                    <option key={t} value={t}>
                      {TYPE_LABEL[t]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="redis-field">
                <label>环境</label>
                <select value={form.env} onChange={(e) => changeEnv(e.target.value as RedisEnv)}>
                  {(["local", "test", "prod"] as const).map((v) => (
                    <option key={v} value={v}>
                      {ENV_META[v].label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="redis-field">
                <label>模式</label>
                <select
                  value={form.mode}
                  onChange={(e) => patch({ mode: e.target.value as RedisMode })}
                >
                  <option value="rw">读写</option>
                  <option value="readonly">只读</option>
                </select>
              </div>
            </div>

            {/* 节点：类型驱动 */}
            <div className="redis-field">
              <label>{multiNode ? (isSentinel ? "哨兵节点" : "集群节点") : "地址"}</label>
              <div className="redis-nodes">
                {form.nodes.map((n, i) => (
                  <div key={i} className="redis-node-row">
                    <input
                      className="redis-node-host"
                      value={n.host}
                      onChange={(e) => updateNode(i, { host: e.target.value })}
                      placeholder="host"
                    />
                    <input
                      className="redis-node-port"
                      type="number"
                      value={n.port}
                      onChange={(e) => updateNode(i, { port: Number(e.target.value) })}
                      placeholder="port"
                    />
                    {multiNode && form.nodes.length > 1 && (
                      <button className="redis-node-del" onClick={() => removeNode(i)}>
                        ✕
                      </button>
                    )}
                  </div>
                ))}
                {multiNode && (
                  <button className="redis-node-add" onClick={addNode}>
                    + 添加节点
                  </button>
                )}
              </div>
            </div>

            {isSentinel && (
              <div className="redis-field">
                <label>Master 名称</label>
                <input
                  value={form.masterName}
                  onChange={(e) => patch({ masterName: e.target.value })}
                  placeholder="mymaster"
                />
              </div>
            )}

            <div className="redis-field-row">
              <div className="redis-field" style={{ flex: 2 }}>
                <label>密码（明文存储）</label>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => patch({ password: e.target.value })}
                  placeholder="无密码留空"
                />
              </div>
              {!isCluster && (
                <div className="redis-field">
                  <label>DB 索引</label>
                  <input
                    type="number"
                    value={form.db}
                    onChange={(e) => patch({ db: Number(e.target.value) })}
                  />
                </div>
              )}
            </div>

            {error && <div className="redis-form-error">{error}</div>}
            {testMsg && (
              <div className={`redis-test-msg ${testMsg.ok ? "ok" : "err"}`}>{testMsg.text}</div>
            )}

            <div className="redis-connmgr-actions">
              <button className="redis-btn-ghost" onClick={doTest} disabled={testing}>
                {testing ? "测试中…" : "测试连接"}
              </button>
              <div className="redis-header-spacer" />
              {form.id != null &&
                (confirmDel ? (
                  <>
                    <span className="redis-del-hint">确认删除？</span>
                    <button className="redis-btn-danger" onClick={doDelete}>
                      删除
                    </button>
                    <button className="redis-btn-ghost" onClick={() => setConfirmDel(false)}>
                      取消
                    </button>
                  </>
                ) : (
                  <button className="redis-btn-ghost-danger" onClick={() => setConfirmDel(true)}>
                    删除
                  </button>
                ))}
              <button className="redis-btn-primary" onClick={doSave} disabled={saving}>
                {saving ? "保存中…" : form.id == null ? "创建" : "保存"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
