import Database from "better-sqlite3";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import type { ApiNode, HistoryEntry, NodeType, RequestDraft, ApiEnvironment, ApiVariable } from "@/components/api-client/types";
import { emptyRequest } from "@/components/api-client/types";
import type {
  RedisConnection,
  RedisConnectionInput,
  RedisEnv,
  RedisMode,
  RedisConnType,
  RedisNode,
} from "@/lib/redis/types";

export interface TokenConfig {
  headerName: string;
  prefix: string;
  token: string;
}

export interface RequestRecord {
  id: number;
  name: string;
  url: string;
  method: string;
  headers: Record<string, string>;
  useCount: number;
  lastUsedAt: string;
  createdAt: string;
}

let db: Database.Database | null = null;

function getDb(): Database.Database {
  if (db) return db;
  const globalForDb = globalThis as unknown as { __appDb?: Database.Database };
  if (globalForDb.__appDb) { db = globalForDb.__appDb; return db; }

  const dataDir = path.join(process.cwd(), "data");
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

  const instance = new Database(path.join(dataDir, "app.db"));
  instance.pragma("journal_mode = WAL");
  migrate(instance);

  db = instance;
  globalForDb.__appDb = instance;
  return db;
}

/**
 * 数据库迁移。
 * v0/v1：request_records 唯一键为 (url, method)
 * v2：唯一键改为 (url, method, name)，支持同 URL 多个命名记录。
 */
function migrate(instance: Database.Database): void {
  // 建基础表（首次）
  instance.exec(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key        TEXT PRIMARY KEY,
      value      TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS request_records (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      name         TEXT NOT NULL DEFAULT '',
      url          TEXT NOT NULL,
      method       TEXT NOT NULL DEFAULT 'GET',
      headers_json TEXT NOT NULL DEFAULT '{}',
      use_count    INTEGER NOT NULL DEFAULT 1,
      last_used_at TEXT NOT NULL,
      created_at   TEXT NOT NULL
    );

    -- 接口调试·集合（api-collections ②）：节点树（邻接表）与请求历史
    CREATE TABLE IF NOT EXISTS api_nodes (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      parent_id   INTEGER,                     -- 邻接表父指针（NULL=根级）；级联删除由应用层递归实现
      type        TEXT NOT NULL,               -- 'folder' | 'request'
      name        TEXT NOT NULL,
      sort_order  INTEGER NOT NULL DEFAULT 0,
      definition  TEXT NOT NULL DEFAULT '',    -- request 的 RequestDraft JSON；folder 为空串
      created_at  TEXT NOT NULL,
      updated_at  TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS api_history (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      node_id    INTEGER,                      -- 来源节点（NULL=未保存请求）
      snapshot   TEXT NOT NULL,                -- 请求定义 JSON
      status     INTEGER NOT NULL DEFAULT 0,   -- HTTP 状态码；0=代理层错误
      time_ms    INTEGER NOT NULL DEFAULT 0,
      size       INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    -- 接口调试·环境与变量（api-environments ③）
    CREATE TABLE IF NOT EXISTS api_environments (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      name      TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 0     -- 单激活：至多一行为 1
    );

    CREATE TABLE IF NOT EXISTS api_variables (
      id      INTEGER PRIMARY KEY AUTOINCREMENT,
      env_id  INTEGER,                         -- NULL=全局变量
      key     TEXT NOT NULL,
      value   TEXT NOT NULL DEFAULT '',
      enabled INTEGER NOT NULL DEFAULT 1
    );

    -- Redis 管理·连接配置（redis-connection）：密码明文存（本地自用）
    CREATE TABLE IF NOT EXISTS redis_connections (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL,
      type        TEXT NOT NULL DEFAULT 'standalone', -- standalone | cluster | sentinel
      nodes_json  TEXT NOT NULL DEFAULT '[]',         -- RedisNode[] JSON
      master_name TEXT NOT NULL DEFAULT '',           -- 仅 sentinel
      password    TEXT NOT NULL DEFAULT '',
      db          INTEGER NOT NULL DEFAULT 0,
      env         TEXT NOT NULL DEFAULT 'local',      -- local | test | prod
      mode        TEXT NOT NULL DEFAULT 'rw',         -- rw | readonly
      created_at  TEXT NOT NULL,
      updated_at  TEXT NOT NULL
    );
  `);

  const version = (instance.pragma("user_version") as { user_version: number }[])[0].user_version;

  if (version < 2) {
    // v1 → v2：重建 request_records，加 UNIQUE(url, method, name)
    instance.exec(`
      BEGIN;
      ALTER TABLE request_records RENAME TO request_records_old;

      CREATE TABLE request_records (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        name         TEXT NOT NULL DEFAULT '',
        url          TEXT NOT NULL,
        method       TEXT NOT NULL DEFAULT 'GET',
        headers_json TEXT NOT NULL DEFAULT '{}',
        use_count    INTEGER NOT NULL DEFAULT 1,
        last_used_at TEXT NOT NULL,
        created_at   TEXT NOT NULL,
        UNIQUE (url, method, name)
      );

      INSERT INTO request_records (id, name, url, method, headers_json, use_count, last_used_at, created_at)
        SELECT id, COALESCE(NULLIF(name,''), ''), url, method, headers_json, use_count, last_used_at, created_at
        FROM request_records_old;

      DROP TABLE request_records_old;
      PRAGMA user_version = 2;
      COMMIT;
    `);
  }
}

/* ─── Token 配置 ──────────────────────────────────────────── */

const TOKEN_CONFIG_KEY = "global_token_config";

const DEFAULT_TOKEN_CONFIG: TokenConfig = {
  headerName: "Authorization",
  prefix: "Bearer",
  token: "",
};

export function getTokenConfig(): TokenConfig {
  const row = getDb()
    .prepare("SELECT value FROM app_settings WHERE key = ?")
    .get(TOKEN_CONFIG_KEY) as { value: string } | undefined;

  if (!row) return { ...DEFAULT_TOKEN_CONFIG };
  try {
    const parsed = JSON.parse(row.value) as Partial<TokenConfig>;
    return {
      headerName: parsed.headerName ?? DEFAULT_TOKEN_CONFIG.headerName,
      prefix: parsed.prefix ?? "",
      token: parsed.token ?? "",
    };
  } catch {
    return { ...DEFAULT_TOKEN_CONFIG };
  }
}

export function setTokenConfig(cfg: TokenConfig): void {
  const value = JSON.stringify({
    headerName: cfg.headerName?.trim() || DEFAULT_TOKEN_CONFIG.headerName,
    prefix: cfg.prefix ?? "",
    token: cfg.token ?? "",
  });
  getDb()
    .prepare(
      `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    )
    .run(TOKEN_CONFIG_KEY, value, new Date().toISOString());
}

/* ─── 超时配置 ────────────────────────────────────────────── */

const TIMEOUT_CONFIG_KEY = "proxy_timeout_ms";

/** 默认请求超时（毫秒）：30 分钟。 */
const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;

/**
 * DB 无值时的回退默认：优先读环境变量 PROXY_TIMEOUT_MS（毫秒），
 * 非法或未设置时回退到 30 分钟。兼容前端配置落地前的旧部署方式。
 */
function fallbackTimeoutMs(): number {
  const raw = process.env.PROXY_TIMEOUT_MS;
  if (raw && raw.trim() !== "") {
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return DEFAULT_TIMEOUT_MS;
}

/**
 * 读取请求超时（毫秒）。
 * 优先级：DB 配置 > 环境变量 PROXY_TIMEOUT_MS > 默认 30 分钟。
 * 每次请求调用即可拿到最新值，前端修改后无需重启服务。
 */
export function getTimeoutMs(): number {
  const row = getDb()
    .prepare("SELECT value FROM app_settings WHERE key = ?")
    .get(TIMEOUT_CONFIG_KEY) as { value: string } | undefined;

  if (!row) return fallbackTimeoutMs();
  const parsed = Number(row.value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallbackTimeoutMs();
}

/**
 * 保存请求超时（毫秒）。调用方需保证 ms 为正数（API 层已校验）。
 */
export function setTimeoutMs(ms: number): void {
  getDb()
    .prepare(
      `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    )
    .run(TIMEOUT_CONFIG_KEY, String(Math.round(ms)), new Date().toISOString());
}

/* ─── 请求历史 ────────────────────────────────────────────── */

/**
 * 检查 (url, method, name) 是否已存在。
 * 用于保存前前端实时验证。
 */
export function checkRecordExists(url: string, method: string, name: string): boolean {
  const row = getDb()
    .prepare("SELECT id FROM request_records WHERE url = ? AND method = ? AND name = ?")
    .get(url, method.toUpperCase(), name);
  return row !== undefined;
}

/**
 * 新增一条命名记录（保存按钮触发）。
 * 若 (url, method, name) 已存在，抛出错误。
 */
export function insertRecord(input: {
  name: string;
  url: string;
  method?: string;
  headers?: Record<string, string>;
}): void {
  const method = (input.method ?? "GET").toUpperCase();
  const name = input.name.trim();
  if (!name) throw new Error("名称不能为空");

  if (checkRecordExists(input.url, method, name)) {
    throw new Error(`名称"${name}"已存在`);
  }

  const now = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO request_records (name, url, method, headers_json, use_count, last_used_at, created_at)
       VALUES (?, ?, ?, ?, 1, ?, ?)`
    )
    .run(name, input.url, method, JSON.stringify(input.headers ?? {}), now, now);
}

/**
 * 请求成功时更新使用次数（不创建新记录、不修改名称）。
 * 仅当 id 对应记录存在时执行。
 */
export function bumpRecord(id: number): void {
  getDb()
    .prepare(
      `UPDATE request_records
       SET use_count = use_count + 1, last_used_at = ?
       WHERE id = ?`
    )
    .run(new Date().toISOString(), id);
}

/**
 * 搜索历史记录，匹配 name 或 url，按最近使用时间倒序。
 */
export function searchRecords(keyword = "", limit = 20): RequestRecord[] {
  const kw = `%${keyword.trim()}%`;
  const rows = getDb()
    .prepare(
      `SELECT id, name, url, method, headers_json, use_count, last_used_at, created_at
       FROM request_records
       WHERE (@empty = 1) OR name LIKE @kw OR url LIKE @kw
       ORDER BY last_used_at DESC
       LIMIT @limit`
    )
    .all({ empty: keyword.trim() === "" ? 1 : 0, kw, limit }) as Array<Record<string, unknown>>;

  return rows.map((r) => ({
    id: Number(r.id),
    name: (r.name as string) ?? "",
    url: r.url as string,
    method: r.method as string,
    headers: safeParseHeaders(r.headers_json as string),
    useCount: Number(r.use_count),
    lastUsedAt: r.last_used_at as string,
    createdAt: r.created_at as string,
  }));
}

function safeParseHeaders(json: string): Record<string, string> {
  try {
    const parsed = JSON.parse(json);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/* ─── 历史管理（分页 / 删除 / 编辑）────────────────────────── */

function mapRow(r: Record<string, unknown>): RequestRecord {
  return {
    id: Number(r.id),
    name: (r.name as string) ?? "",
    url: r.url as string,
    method: r.method as string,
    headers: safeParseHeaders(r.headers_json as string),
    useCount: Number(r.use_count),
    lastUsedAt: r.last_used_at as string,
    createdAt: r.created_at as string,
  };
}

/** 分页查询，用于历史管理弹窗。 */
export function getPagedRecords(
  page: number,
  pageSize: number,
  keyword = ""
): { records: RequestRecord[]; total: number } {
  const offset = (page - 1) * pageSize;
  const kw = `%${keyword.trim()}%`;
  const empty = keyword.trim() === "" ? 1 : 0;

  const rows = getDb()
    .prepare(
      `SELECT id, name, url, method, headers_json, use_count, last_used_at, created_at
       FROM request_records
       WHERE (@empty = 1) OR name LIKE @kw OR url LIKE @kw
       ORDER BY last_used_at DESC
       LIMIT @pageSize OFFSET @offset`
    )
    .all({ empty, kw, pageSize, offset }) as Array<Record<string, unknown>>;

  const { total } = getDb()
    .prepare(
      `SELECT COUNT(*) as total FROM request_records
       WHERE (@empty = 1) OR name LIKE @kw OR url LIKE @kw`
    )
    .get({ empty, kw }) as { total: number };

  return { records: rows.map(mapRow), total };
}

/** 删除单条记录。 */
export function deleteRecord(id: number): void {
  getDb().prepare("DELETE FROM request_records WHERE id = ?").run(id);
}

/** 编辑记录（名称/URL/Headers），并校验唯一键冲突。 */
export function updateRecord(
  id: number,
  data: { name?: string; url?: string; headers?: Record<string, string> }
): void {
  const db = getDb();

  const current = db
    .prepare("SELECT url, method, name FROM request_records WHERE id = ?")
    .get(id) as { url: string; method: string; name: string } | undefined;
  if (!current) throw new Error("记录不存在");

  const newName = data.name !== undefined ? data.name.trim() : current.name;
  const newUrl = data.url !== undefined ? data.url.trim() : current.url;

  if (!newName) throw new Error("名称不能为空");
  if (!newUrl) throw new Error("URL 不能为空");

  // 唯一键校验（排除自身）
  const conflict = db
    .prepare(
      "SELECT id FROM request_records WHERE url = ? AND method = ? AND name = ? AND id != ?"
    )
    .get(newUrl, current.method, newName, id);
  if (conflict) throw new Error(`名称"${newName}"在同一地址下已存在`);

  const headersJson =
    data.headers !== undefined ? JSON.stringify(data.headers) : undefined;

  if (headersJson !== undefined) {
    db.prepare(
      "UPDATE request_records SET name = ?, url = ?, headers_json = ? WHERE id = ?"
    ).run(newName, newUrl, headersJson, id);
  } else {
    db.prepare(
      "UPDATE request_records SET name = ?, url = ? WHERE id = ?"
    ).run(newName, newUrl, id);
  }
}

/* ─── 接口调试·集合节点（api_nodes，②）───────────────────── */

function safeParseDraft(json: string): RequestDraft | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as RequestDraft;
  } catch {
    return null;
  }
}

function mapNode(r: Record<string, unknown>): ApiNode {
  const type = r.type as NodeType;
  return {
    id: Number(r.id),
    parentId: r.parent_id == null ? null : Number(r.parent_id),
    type,
    name: r.name as string,
    sortOrder: Number(r.sort_order),
    definition: type === "request" ? safeParseDraft(r.definition as string) : null,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

/** 读取全部节点（前端据 parentId 组装成树）。 */
export function listNodes(): ApiNode[] {
  const rows = getDb()
    .prepare(
      `SELECT id, parent_id, type, name, sort_order, definition, created_at, updated_at
       FROM api_nodes ORDER BY parent_id, sort_order, id`
    )
    .all() as Array<Record<string, unknown>>;
  return rows.map(mapNode);
}

/** 按 id 读取单个节点。 */
export function getNode(id: number): ApiNode | null {
  const r = getDb()
    .prepare(
      `SELECT id, parent_id, type, name, sort_order, definition, created_at, updated_at
       FROM api_nodes WHERE id = ?`
    )
    .get(id) as Record<string, unknown> | undefined;
  return r ? mapNode(r) : null;
}

/** 新建节点（追加到目标层级末尾）。 */
export function createNode(input: {
  parentId: number | null;
  type: NodeType;
  name: string;
  definition?: RequestDraft | null;
}): ApiNode {
  const db = getDb();
  // parent_id IS ?：绑定 null 时匹配根级（SQLite 的 IS 对 NULL 成立）
  const { nextOrder } = db
    .prepare(
      `SELECT COALESCE(MAX(sort_order), -1) + 1 AS nextOrder
       FROM api_nodes WHERE parent_id IS ?`
    )
    .get(input.parentId) as { nextOrder: number };

  const now = new Date().toISOString();
  const definition =
    input.type === "request" && input.definition ? JSON.stringify(input.definition) : "";
  const info = db
    .prepare(
      `INSERT INTO api_nodes (parent_id, type, name, sort_order, definition, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(input.parentId, input.type, input.name, nextOrder, definition, now, now);

  return getNode(Number(info.lastInsertRowid))!;
}

/** 重命名节点。 */
export function renameNode(id: number, name: string): void {
  getDb()
    .prepare("UPDATE api_nodes SET name = ?, updated_at = ? WHERE id = ?")
    .run(name, new Date().toISOString(), id);
}

/** 更新 request 节点的定义（保存接口）。 */
export function updateNodeDefinition(id: number, definition: RequestDraft): void {
  getDb()
    .prepare("UPDATE api_nodes SET definition = ?, updated_at = ? WHERE id = ?")
    .run(JSON.stringify(definition), new Date().toISOString(), id);
}

/** 移动 / 排序：更新父节点与同级序号。 */
export function moveNode(id: number, parentId: number | null, sortOrder: number): void {
  getDb()
    .prepare("UPDATE api_nodes SET parent_id = ?, sort_order = ?, updated_at = ? WHERE id = ?")
    .run(parentId, sortOrder, new Date().toISOString(), id);
}

/** 删除节点；folder 级联删除整棵子树（递归 CTE）。 */
export function deleteNodeCascade(id: number): void {
  getDb()
    .prepare(
      `WITH RECURSIVE sub(id) AS (
         SELECT id FROM api_nodes WHERE id = ?
         UNION ALL
         SELECT n.id FROM api_nodes n JOIN sub ON n.parent_id = sub.id
       )
       DELETE FROM api_nodes WHERE id IN (SELECT id FROM sub)`
    )
    .run(id);
}

/* ─── 接口调试·请求历史（api_history，②）─────────────────── */

function mapHistory(r: Record<string, unknown>): HistoryEntry {
  return {
    id: Number(r.id),
    nodeId: r.node_id == null ? null : Number(r.node_id),
    snapshot: safeParseDraft(r.snapshot as string) ?? emptyRequest(),
    status: Number(r.status),
    timeMs: Number(r.time_ms),
    size: Number(r.size),
    createdAt: r.created_at as string,
  };
}

/** 倒序读取历史。 */
export function listHistory(limit = 200): HistoryEntry[] {
  const rows = getDb()
    .prepare(
      `SELECT id, node_id, snapshot, status, time_ms, size, created_at
       FROM api_history ORDER BY created_at DESC, id DESC LIMIT ?`
    )
    .all(limit) as Array<Record<string, unknown>>;
  return rows.map(mapHistory);
}

/** 追加一条历史。 */
export function appendHistory(input: {
  nodeId: number | null;
  snapshot: RequestDraft;
  status: number;
  timeMs: number;
  size: number;
}): HistoryEntry {
  const now = new Date().toISOString();
  const db = getDb();
  const info = db
    .prepare(
      `INSERT INTO api_history (node_id, snapshot, status, time_ms, size, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(input.nodeId, JSON.stringify(input.snapshot), input.status, input.timeMs, input.size, now);
  const r = db
    .prepare(
      `SELECT id, node_id, snapshot, status, time_ms, size, created_at
       FROM api_history WHERE id = ?`
    )
    .get(Number(info.lastInsertRowid)) as Record<string, unknown>;
  return mapHistory(r);
}

/** 删除单条历史。 */
export function deleteHistory(id: number): void {
  getDb().prepare("DELETE FROM api_history WHERE id = ?").run(id);
}

/** 清空历史。 */
export function clearHistory(): void {
  getDb().prepare("DELETE FROM api_history").run();
}

/* ─── 接口调试·环境与变量（api-environments ③）──────────── */

function mapEnv(r: Record<string, unknown>): ApiEnvironment {
  return { id: Number(r.id), name: r.name as string, isActive: Number(r.is_active) === 1 };
}
function mapVar(r: Record<string, unknown>): ApiVariable {
  return {
    id: Number(r.id),
    envId: r.env_id == null ? null : Number(r.env_id),
    key: r.key as string,
    value: r.value as string,
    enabled: Number(r.enabled) === 1,
  };
}

/** 全部环境（含激活标记）。 */
export function listEnvironments(): ApiEnvironment[] {
  const rows = getDb()
    .prepare("SELECT id, name, is_active FROM api_environments ORDER BY id")
    .all() as Array<Record<string, unknown>>;
  return rows.map(mapEnv);
}

export function createEnvironment(name: string): ApiEnvironment {
  const info = getDb()
    .prepare("INSERT INTO api_environments (name, is_active) VALUES (?, 0)")
    .run(name);
  return { id: Number(info.lastInsertRowid), name, isActive: false };
}

export function renameEnvironment(id: number, name: string): void {
  getDb().prepare("UPDATE api_environments SET name = ? WHERE id = ?").run(name, id);
}

/** 删除环境并级联其环境级变量（事务）。 */
export function deleteEnvironment(id: number): void {
  const db = getDb();
  const tx = db.transaction((eid: number) => {
    db.prepare("DELETE FROM api_variables WHERE env_id = ?").run(eid);
    db.prepare("DELETE FROM api_environments WHERE id = ?").run(eid);
  });
  tx(id);
}

/** 单激活：全部置 0，再把目标置 1（id=null → 全不激活/无环境）。 */
export function setActiveEnvironment(id: number | null): void {
  const db = getDb();
  const tx = db.transaction((eid: number | null) => {
    db.prepare("UPDATE api_environments SET is_active = 0").run();
    if (eid != null) db.prepare("UPDATE api_environments SET is_active = 1 WHERE id = ?").run(eid);
  });
  tx(id);
}

/** 全部变量（前端按 envId 分组：null=全局）。 */
export function listVariables(): ApiVariable[] {
  const rows = getDb()
    .prepare("SELECT id, env_id, key, value, enabled FROM api_variables ORDER BY env_id, id")
    .all() as Array<Record<string, unknown>>;
  return rows.map(mapVar);
}

export function createVariable(input: {
  envId: number | null;
  key: string;
  value: string;
  enabled?: boolean;
}): ApiVariable {
  const enabled = input.enabled !== false;
  const info = getDb()
    .prepare("INSERT INTO api_variables (env_id, key, value, enabled) VALUES (?, ?, ?, ?)")
    .run(input.envId, input.key, input.value, enabled ? 1 : 0);
  return { id: Number(info.lastInsertRowid), envId: input.envId, key: input.key, value: input.value, enabled };
}

export function updateVariable(
  id: number,
  patch: { key?: string; value?: string; enabled?: boolean }
): void {
  const db = getDb();
  const cur = db
    .prepare("SELECT key, value, enabled FROM api_variables WHERE id = ?")
    .get(id) as { key: string; value: string; enabled: number } | undefined;
  if (!cur) return;
  const key = patch.key !== undefined ? patch.key : cur.key;
  const value = patch.value !== undefined ? patch.value : cur.value;
  const enabled = patch.enabled !== undefined ? (patch.enabled ? 1 : 0) : cur.enabled;
  db.prepare("UPDATE api_variables SET key = ?, value = ?, enabled = ? WHERE id = ?").run(
    key,
    value,
    enabled,
    id
  );
}

export function deleteVariable(id: number): void {
  getDb().prepare("DELETE FROM api_variables WHERE id = ?").run(id);
}

/* ─── Redis 管理·连接配置（redis_connections）──────────────── */

function safeParseNodes(json: string): RedisNode[] {
  try {
    const parsed = JSON.parse(json);
    if (Array.isArray(parsed)) {
      return parsed
        .filter((n) => n && typeof n === "object")
        .map((n) => ({ host: String(n.host ?? ""), port: Number(n.port ?? 0) }));
    }
  } catch {
    /* 落空返回空数组 */
  }
  return [];
}

function mapRedisConn(r: Record<string, unknown>): RedisConnection {
  return {
    id: Number(r.id),
    name: r.name as string,
    type: r.type as RedisConnType,
    nodes: safeParseNodes(r.nodes_json as string),
    masterName: (r.master_name as string) ?? "",
    password: (r.password as string) ?? "",
    db: Number(r.db),
    env: r.env as RedisEnv,
    mode: r.mode as RedisMode,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

/** 全部连接配置（按 id）。 */
export function listRedisConnections(): RedisConnection[] {
  const rows = getDb()
    .prepare(
      `SELECT id, name, type, nodes_json, master_name, password, db, env, mode, created_at, updated_at
       FROM redis_connections ORDER BY id`
    )
    .all() as Array<Record<string, unknown>>;
  return rows.map(mapRedisConn);
}

/** 按 id 读取单个连接。 */
export function getRedisConnection(id: number): RedisConnection | null {
  const r = getDb()
    .prepare(
      `SELECT id, name, type, nodes_json, master_name, password, db, env, mode, created_at, updated_at
       FROM redis_connections WHERE id = ?`
    )
    .get(id) as Record<string, unknown> | undefined;
  return r ? mapRedisConn(r) : null;
}

/** 生产环境默认只读；其余默认读写。 */
function defaultMode(env: RedisEnv, mode?: RedisMode): RedisMode {
  if (mode) return mode;
  return env === "prod" ? "readonly" : "rw";
}

/** 新建连接。 */
export function createRedisConnection(input: RedisConnectionInput): RedisConnection {
  const name = input.name.trim();
  if (!name) throw new Error("连接名称不能为空");
  if (!input.nodes || input.nodes.length === 0) throw new Error("至少需要一个节点");

  const now = new Date().toISOString();
  const info = getDb()
    .prepare(
      `INSERT INTO redis_connections
         (name, type, nodes_json, master_name, password, db, env, mode, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      name,
      input.type,
      JSON.stringify(input.nodes),
      input.masterName ?? "",
      input.password ?? "",
      input.db ?? 0,
      input.env,
      defaultMode(input.env, input.mode),
      now,
      now
    );
  return getRedisConnection(Number(info.lastInsertRowid))!;
}

/** 编辑连接（全量覆盖可编辑字段）。 */
export function updateRedisConnection(id: number, input: RedisConnectionInput): RedisConnection {
  const current = getRedisConnection(id);
  if (!current) throw new Error("连接不存在");

  const name = input.name.trim();
  if (!name) throw new Error("连接名称不能为空");
  if (!input.nodes || input.nodes.length === 0) throw new Error("至少需要一个节点");

  getDb()
    .prepare(
      `UPDATE redis_connections
       SET name = ?, type = ?, nodes_json = ?, master_name = ?, password = ?, db = ?, env = ?, mode = ?, updated_at = ?
       WHERE id = ?`
    )
    .run(
      name,
      input.type,
      JSON.stringify(input.nodes),
      input.masterName ?? "",
      input.password ?? "",
      input.db ?? 0,
      input.env,
      input.mode ?? current.mode,
      new Date().toISOString(),
      id
    );
  return getRedisConnection(id)!;
}

/** 删除连接。 */
export function deleteRedisConnection(id: number): void {
  getDb().prepare("DELETE FROM redis_connections WHERE id = ?").run(id);
}
