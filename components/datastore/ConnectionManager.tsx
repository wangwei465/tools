"use client";

import { useEffect, useState } from "react";
import {
  MASKED_SECRET,
  RDB_DEFAULT_PORT,
  buildRdbUri,
  isRdbType,
  parseExtra,
  parseRdbUri,
  type DatastoreConnection,
  type DatastoreConnectionInput,
  type DatastoreEnv,
  type DatastoreMode,
  type DatastoreType,
  type RdbType,
} from "@/lib/datastore/types";
import { datastoreApi } from "@/components/datastore/api";
import { ENV_META, TYPE_LABEL } from "@/components/datastore/ConnectionBar";

interface Props {
  open: boolean;
  connections: DatastoreConnection[];
  onClose: () => void;
  onChanged: () => Promise<DatastoreConnection[]> | void;
}

/**
 * 表单状态：id 为 null 表示新建。
 * 差异化字段在此拍平便于编辑：apiKey（ES）、authDb（Mongo）、
 * host/port/database/ssl（关系型——落库时组装回 uri 一列，表结构不变）。
 */
interface FormState {
  id: number | null;
  name: string;
  type: DatastoreType;
  uri: string;
  username: string;
  password: string;
  apiKey: string; // ES 专有
  authDb: string; // Mongo 专有
  host: string; // 关系型专有
  port: string; // 关系型专有（留空取默认端口）
  database: string; // 关系型专有
  ssl: boolean; // 关系型专有
  sslRejectUnauthorized: boolean; // 关系型专有
  env: DatastoreEnv;
  mode: DatastoreMode;
}

const BLANK: FormState = {
  id: null,
  name: "",
  type: "es",
  uri: "http://127.0.0.1:9200",
  username: "",
  password: "",
  apiKey: "",
  authDb: "",
  host: "127.0.0.1",
  port: "",
  database: "",
  ssl: false,
  sslRejectUnauthorized: true,
  env: "local",
  mode: "rw",
};

/** 切换类型时的默认地址：各类数据源的地址形态完全不同，留着上一类的值只会误导。 */
const DEFAULT_URI: Record<DatastoreType, string> = {
  es: "http://127.0.0.1:9200",
  mongo: "mongodb://127.0.0.1:27017",
  mysql: "",
  postgres: "",
};

function connToForm(c: DatastoreConnection): FormState {
  const extra = parseExtra(c.extraJson);
  // 关系型的 host/port/database 是从 uri 拆出来的；解析失败时回落空值让用户重填
  let target = { host: "", port: 0, database: "" };
  if (isRdbType(c.type)) {
    try {
      target = parseRdbUri(c);
    } catch {
      /* 保留空值 */
    }
  }

  return {
    id: c.id,
    name: c.name,
    type: c.type,
    uri: c.uri,
    username: c.username,
    password: c.password, // 已脱敏；保存时原样回传即视为「未修改」
    apiKey: extra.apiKey ?? "",
    authDb: extra.authDb ?? "",
    host: target.host,
    port: target.port ? String(target.port) : "",
    database: target.database,
    ssl: extra.ssl ?? false,
    sslRejectUnauthorized: extra.sslRejectUnauthorized ?? true,
    env: c.env,
    mode: c.mode,
  };
}

/** 各类型只带自己那份差异参数，避免切换类型后残留上一类的配置。 */
function toExtra(f: FormState) {
  if (f.type === "es") return { apiKey: f.apiKey };
  if (f.type === "mongo") return { authDb: f.authDb };
  return { ssl: f.ssl, sslRejectUnauthorized: f.sslRejectUnauthorized };
}

function toInput(f: FormState): DatastoreConnectionInput {
  const uri = isRdbType(f.type)
    ? buildRdbUri(f.type, {
        host: f.host,
        port: Number(f.port) || 0,
        database: f.database,
      })
    : f.uri;

  return {
    name: f.name,
    type: f.type,
    uri,
    username: f.username,
    password: f.password,
    extraJson: JSON.stringify(toExtra(f)),
    env: f.env,
    mode: f.mode,
  };
}

/**
 * 连接管理弹窗：左侧连接列表，右侧编辑表单。
 * 类型选择驱动差异化字段（ES 的 API Key / Mongo 的认证库），支持测试连接与增删改。
 *
 * 凭证从接口取回时已脱敏为占位符：原样回传表示不修改，清空则真正清除。
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

  const selectConn = (c: DatastoreConnection) => {
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

  // 类型切换：地址形态不同，新建态下同步换默认地址（编辑既有连接时不动用户填的值）
  const changeType = (type: DatastoreType) => {
    setForm((f) => ({
      ...f,
      type,
      uri: f.id == null && f.uri === DEFAULT_URI[f.type] ? DEFAULT_URI[type] : f.uri,
    }));
    setTestMsg(null);
  };
  // 环境切换：切到生产时自动置只读（可再手动改回）
  const changeEnv = (env: DatastoreEnv) => {
    setForm((f) => ({ ...f, env, mode: env === "prod" ? "readonly" : f.mode }));
    setTestMsg(null);
  };

  const doTest = async () => {
    setTesting(true);
    setTestMsg(null);
    try {
      const r = await datastoreApi.testConnection({
        ...toInput(form),
        ...(form.id != null ? { id: form.id } : {}),
      });
      setTestMsg(
        r.ok
          ? { ok: true, text: `连接成功：版本 ${r.version ?? "?"}（${r.latencyMs ?? "?"}ms）` }
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
          ? await datastoreApi.createConnection(input)
          : await datastoreApi.updateConnection(form.id, input);
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
    await datastoreApi.deleteConnection(form.id);
    await onChanged();
    newConn();
  };

  const isEs = form.type === "es";
  const isRdb = isRdbType(form.type);
  const secretHint = form.id == null ? "" : "留空即清除；不改则保持占位符";

  return (
    <div className="ds-modal-mask" onClick={onClose}>
      <div className="ds-modal ds-connmgr" onClick={(e) => e.stopPropagation()}>
        <div className="ds-modal-header">
          <span className="ds-modal-title">连接管理</span>
          <button className="ds-modal-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="ds-connmgr-body">
          {/* 左：连接列表 */}
          <div className="ds-connmgr-list">
            <button className="ds-connmgr-new" onClick={newConn}>
              + 新建连接
            </button>
            {connections.map((c) => (
              <div
                key={c.id}
                className={`ds-connmgr-item${form.id === c.id ? " active" : ""}`}
                onClick={() => selectConn(c)}
              >
                <span className="ds-connmgr-name">{c.name}</span>
                <span className={`ds-badge ${ENV_META[c.env].cls}`}>{ENV_META[c.env].label}</span>
              </div>
            ))}
            {connections.length === 0 && <div className="ds-connmgr-empty">暂无连接</div>}
          </div>

          {/* 右：编辑表单 */}
          <div className="ds-connmgr-form">
            <div className="ds-field">
              <label>连接名称</label>
              <input
                value={form.name}
                onChange={(e) => patch({ name: e.target.value })}
                placeholder="如 local-es / prod-mongo"
              />
            </div>

            <div className="ds-field-row">
              <div className="ds-field">
                <label>类型</label>
                <select
                  value={form.type}
                  onChange={(e) => changeType(e.target.value as DatastoreType)}
                >
                  {(["es", "mongo", "mysql", "postgres"] as const).map((t) => (
                    <option key={t} value={t}>
                      {TYPE_LABEL[t]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="ds-field">
                <label>环境</label>
                <select value={form.env} onChange={(e) => changeEnv(e.target.value as DatastoreEnv)}>
                  {(["local", "test", "prod"] as const).map((v) => (
                    <option key={v} value={v}>
                      {ENV_META[v].label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="ds-field">
                <label>模式</label>
                <select
                  value={form.mode}
                  onChange={(e) => patch({ mode: e.target.value as DatastoreMode })}
                >
                  <option value="rw">读写</option>
                  <option value="readonly">只读</option>
                </select>
              </div>
            </div>

            {/* 类型决定可填字段：关系型填 host/port/库名，其余填单个地址串 */}
            {isRdb ? (
              <div className="ds-field-row">
                <div className="ds-field" style={{ flex: 2 }}>
                  <label>主机</label>
                  <input
                    value={form.host}
                    onChange={(e) => patch({ host: e.target.value })}
                    placeholder="127.0.0.1"
                    spellCheck={false}
                  />
                </div>
                <div className="ds-field">
                  <label>端口</label>
                  <input
                    value={form.port}
                    onChange={(e) => patch({ port: e.target.value.replace(/\D/g, "") })}
                    placeholder={String(RDB_DEFAULT_PORT[form.type as RdbType])}
                    spellCheck={false}
                  />
                </div>
                <div className="ds-field" style={{ flex: 2 }}>
                  <label>库名</label>
                  <input
                    value={form.database}
                    onChange={(e) => patch({ database: e.target.value })}
                    placeholder={form.type === "postgres" ? "该连接绑定此库" : "可留空（可列全部库）"}
                    spellCheck={false}
                  />
                </div>
              </div>
            ) : (
              <div className="ds-field">
                <label>{isEs ? "服务地址" : "连接串"}</label>
                <input
                  value={form.uri}
                  onChange={(e) => patch({ uri: e.target.value })}
                  placeholder={DEFAULT_URI[form.type]}
                  spellCheck={false}
                />
              </div>
            )}

            <div className="ds-field-row">
              <div className="ds-field">
                <label>用户名</label>
                <input
                  value={form.username}
                  onChange={(e) => patch({ username: e.target.value })}
                  placeholder="无认证留空"
                />
              </div>
              <div className="ds-field">
                <label>密码（明文存储）</label>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => patch({ password: e.target.value })}
                  placeholder={secretHint || "无密码留空"}
                />
              </div>
            </div>

            {isRdb ? (
              <div className="ds-field-row">
                <label className="ds-checkbox">
                  <input
                    type="checkbox"
                    checked={form.ssl}
                    onChange={(e) => patch({ ssl: e.target.checked })}
                  />
                  启用 SSL / TLS
                </label>
                <label className="ds-checkbox">
                  <input
                    type="checkbox"
                    checked={form.sslRejectUnauthorized}
                    disabled={!form.ssl}
                    onChange={(e) => patch({ sslRejectUnauthorized: e.target.checked })}
                  />
                  校验服务端证书（自签名证书需关闭）
                </label>
              </div>
            ) : isEs ? (
              <div className="ds-field">
                <label>API Key（填写后优先于 Basic Auth）</label>
                <input
                  type="password"
                  value={form.apiKey}
                  onChange={(e) => patch({ apiKey: e.target.value })}
                  placeholder={secretHint || "不使用 API Key 留空"}
                />
              </div>
            ) : (
              <div className="ds-field">
                <label>认证库（authSource）</label>
                <input
                  value={form.authDb}
                  onChange={(e) => patch({ authDb: e.target.value })}
                  placeholder="如 admin；连接串已带则留空"
                />
              </div>
            )}

            {error && <div className="ds-form-error">{error}</div>}
            {testMsg && <div className={`ds-test-msg ${testMsg.ok ? "ok" : "err"}`}>{testMsg.text}</div>}

            <div className="ds-connmgr-actions">
              <button className="ds-btn-ghost" onClick={doTest} disabled={testing}>
                {testing ? "测试中…" : "测试连接"}
              </button>
              <div className="ds-spacer" />
              {form.id != null &&
                (confirmDel ? (
                  <>
                    <span className="ds-del-hint">确认删除？</span>
                    <button className="ds-btn-danger" onClick={doDelete}>
                      删除
                    </button>
                    <button className="ds-btn-ghost" onClick={() => setConfirmDel(false)}>
                      取消
                    </button>
                  </>
                ) : (
                  <button className="ds-btn-ghost-danger" onClick={() => setConfirmDel(true)}>
                    删除
                  </button>
                ))}
              <button className="ds-btn-primary" onClick={doSave} disabled={saving}>
                {saving ? "保存中…" : form.id == null ? "创建" : "保存"}
              </button>
            </div>
            {form.password === MASKED_SECRET && (
              <div className="ds-hint">密码已保存，此处仅为占位符</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
