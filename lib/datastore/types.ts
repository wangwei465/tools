/**
 * 数据源（Elasticsearch / MongoDB / MySQL / PostgreSQL）工具的纯数据类型（无服务端依赖）。
 * 服务端（app/api/datastore、lib/datastore）与前端（components/datastore）共用，
 * 故此文件禁止 import mongodb / mysql2 / pg / better-sqlite3 等仅服务端可用的模块。
 */

/** 数据源类型。 */
export type DatastoreType = "es" | "mongo" | "mysql" | "postgres";

/** 关系型数据源（MySQL / PostgreSQL）：目录层级与 SQL 执行共用一套模型。 */
export type RdbType = Extract<DatastoreType, "mysql" | "postgres">;

/** 是否为关系型数据源。 */
export function isRdbType(type: DatastoreType): type is RdbType {
  return type === "mysql" || type === "postgres";
}

/** 环境标签：用于操作前辨识，生产默认只读。 */
export type DatastoreEnv = "local" | "test" | "prod";

/** 读写模式：只读模式拦截一切写操作。 */
export type DatastoreMode = "rw" | "readonly";

/**
 * 凭证脱敏占位符。
 * 连接列表接口以此替换非空的密码 / API Key；编辑保存时若字段仍为该值，
 * 视为「未修改」保留原值（故用户仍可通过清空输入框来真正清除凭证）。
 */
export const MASKED_SECRET = "********";

/**
 * 四类数据源的差异化参数（存 extra_json 一列）。
 * 公共字段占多数，差异部分用一个 JSON 列容纳——与 redis_connections
 * 用 nodes_json 容纳三种连接类型差异是同一手法。
 */
export interface DatastoreExtra {
  /** ES：API Key 认证（与 Basic Auth 二选一，优先 API Key）。 */
  apiKey?: string;
  /** Mongo：认证库（authSource）。 */
  authDb?: string;
  /** 关系型：启用 SSL / TLS。 */
  ssl?: boolean;
  /** 关系型：SSL 下是否校验服务端证书（自签名证书场景置 false）。 */
  sslRejectUnauthorized?: boolean;
}

/** 连接配置（对应 datastore_connections 一行）。 */
export interface DatastoreConnection {
  id: number;
  name: string;
  type: DatastoreType;
  /**
   * ES 为 base URL（如 http://127.0.0.1:9200）；Mongo 为连接串（mongodb://…）；
   * 关系型为组装后的连接串（mysql://host:port/db、postgres://host:port/db）。
   */
  uri: string;
  username: string;
  password: string; // 明文存储（本地自用）；列表接口返回脱敏值
  extraJson: string; // DatastoreExtra 的 JSON
  env: DatastoreEnv;
  mode: DatastoreMode;
  createdAt: string;
  updatedAt: string;
}

/** 新建 / 编辑连接的入参（不含 id 与时间戳）。 */
export interface DatastoreConnectionInput {
  name: string;
  type: DatastoreType;
  uri: string;
  username?: string;
  password?: string;
  extraJson?: string;
  env: DatastoreEnv;
  mode?: DatastoreMode;
}

/** 解析 extra_json；非法或缺失时回落空对象。 */
export function parseExtra(extraJson: string | null | undefined): DatastoreExtra {
  if (!extraJson) return {};
  try {
    const parsed = JSON.parse(extraJson) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as DatastoreExtra;
    }
  } catch {
    /* 落空返回空对象 */
  }
  return {};
}

/* ─── 关系型连接串 ────────────────────────────────────────── */

/** 各关系型数据源的默认端口。 */
export const RDB_DEFAULT_PORT: Record<RdbType, number> = { mysql: 3306, postgres: 5432 };

/** 关系型连接的建连要素。 */
export interface RdbTarget {
  host: string;
  port: number;
  database: string;
}

/**
 * 组装关系型连接串。
 * 连接管理表单填 host/port/database，落库时仍复用既有的 `uri` 一列——
 * 这是本变更能做到「app.db 零表结构变动」的关键。
 */
export function buildRdbUri(type: RdbType, target: RdbTarget): string {
  const host = target.host.trim() || "127.0.0.1";
  const port = target.port || RDB_DEFAULT_PORT[type];
  return `${type}://${host}:${port}/${encodeURIComponent(target.database.trim())}`;
}

/**
 * 解析关系型连接串。
 *
 * 连接串由连接管理表单组装，形态可控；容错只保留「缺端口取默认」这一条，
 * 其余非法形态直接报错——静默兜底会让用户以为连的是 A 实际连了 B。
 */
export function parseRdbUri(conn: { type: DatastoreType; uri: string }): RdbTarget {
  const raw = conn.uri.trim();
  if (!raw) throw new Error("连接串不能为空");

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`连接串格式不正确：${raw}`);
  }

  const host = url.hostname;
  if (!host) throw new Error(`连接串缺少主机名：${raw}`);

  const fallbackPort = isRdbType(conn.type) ? RDB_DEFAULT_PORT[conn.type] : 0;
  return {
    host,
    port: url.port ? Number(url.port) : fallbackPort,
    database: decodeURIComponent(url.pathname.replace(/^\//, "")),
  };
}

/* ─── ES 目录 ─────────────────────────────────────────────── */

/** `_cat/indices` 一行。 */
export interface EsIndexInfo {
  index: string;
  health: string; // green | yellow | red | ""
  status: string; // open | close | ""
  docsCount: number;
  storeSize: string; // 人类可读，如 "1.2mb"
}

/** mapping 字段树节点；object / nested 携带 children。 */
export interface EsField {
  name: string; // 末段字段名
  path: string; // 完整点分路径
  type: string; // 字段类型；无 type 的容器节点为 "object"
  children?: EsField[];
}

/* ─── ES 查询 ─────────────────────────────────────────────── */

/**
 * `_search` 解析结果。
 * parsed 为 false 表示响应形状无法按预期解析，此时仅 raw 可用（跨版本兼容兜底）。
 */
export interface EsSearchResult {
  parsed: boolean;
  total: number;
  /** 命中总数关系：eq 精确 / gte 至少（7.x+ 默认 track_total_hits 上限 10000）。 */
  relation: string;
  tookMs: number;
  /** 命中文档的 _source（附加 _id / _index 便于核对）。 */
  docs: Array<Record<string, unknown>>;
  raw: unknown;
}

/* ─── Mongo 目录 ──────────────────────────────────────────── */

export interface MongoDatabaseInfo {
  name: string;
  sizeOnDisk: number;
}

export interface MongoCollectionInfo {
  name: string;
  docCount: number;
  indexCount: number;
}

/** 采样推断出的字段：同名字段出现多种类型时全部保留。 */
export interface MongoFieldSample {
  path: string; // 点分路径（嵌套对象展开）
  types: string[];
  /** 采样文档中出现该字段的条数。 */
  presentCount: number;
}

/** 采样结果：附采样条数，供 UI 标注「这是推断而非权威 schema」。 */
export interface MongoFieldSampleResult {
  sampled: number;
  fields: MongoFieldSample[];
}

export interface MongoIndexInfo {
  name: string;
  keys: string; // 如 "userId:1, createdAt:-1"
}

/* ─── Mongo 查询 ──────────────────────────────────────────── */

/** find / aggregate 的执行结果（文档已做 BSON 可读化）。 */
export interface MongoQueryResult {
  docs: Array<Record<string, unknown>>;
  tookMs: number;
}

/* ─── 关系型目录 ──────────────────────────────────────────── */

/**
 * 表 / 视图一条。
 *
 * rowCount 是估算值（MySQL 的 `TABLE_ROWS`、PG 的 `pg_class.reltuples`）——
 * 精确计数要全表扫描，排查场景下量级足够，故不为此付代价；取不到时为 null，
 * 由 UI 区分「零行」与「未知」。
 */
export interface RdbTableInfo {
  name: string;
  type: "table" | "view";
  rowCount: number | null;
  comment: string;
}

/** 列一条。 */
export interface RdbColumnInfo {
  name: string;
  /** 数据类型（含长度 / 精度，如 `varchar(64)`）。 */
  dataType: string;
  nullable: boolean;
  /** 默认值；无默认值为 null（与「默认值为字符串 'null'」区分）。 */
  defaultValue: string | null;
  primaryKey: boolean;
  comment: string;
}

/** 索引一条（多列索引的列按索引内顺序排列）。 */
export interface RdbIndexInfo {
  name: string;
  columns: string[];
  unique: boolean;
}

/** 表详情：列结构 + 索引。 */
export interface RdbTableDetail {
  columns: RdbColumnInfo[];
  indexes: RdbIndexInfo[];
}

/* ─── 关系型查询 ──────────────────────────────────────────── */

/**
 * SQL 执行结果。
 *
 * columns 必须来自驱动返回的字段元数据而非行对象的键顺序——`SELECT b, a FROM t`
 * 的列顺序是结果集语义的一部分，用键顺序推断会在重名列与空结果集上失真。
 */
export interface RdbExecResult {
  /** 有序列名；写语句无结果集时为空数组。 */
  columns: string[];
  rows: Array<Record<string, unknown>>;
  /** 返回行数。 */
  rowCount: number;
  /** 写语句的影响行数；读语句为 undefined。 */
  affectedRows?: number;
  tookMs: number;
  /** 实际执行的 SQL（LIMIT 被注入时与用户输入不同，必须回显）。 */
  executedSql: string;
  /** 结果被读取侧硬上限截断。 */
  truncated: boolean;
}
