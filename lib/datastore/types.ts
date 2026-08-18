/**
 * 数据源（Elasticsearch / MongoDB）工具的纯数据类型（无服务端依赖）。
 * 服务端（app/api/datastore、lib/datastore）与前端（components/datastore）共用，
 * 故此文件禁止 import mongodb / better-sqlite3 等仅服务端可用的模块。
 */

/** 数据源类型。 */
export type DatastoreType = "es" | "mongo";

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
 * 两类数据源的差异化参数（存 extra_json 一列）。
 * 公共字段占多数，差异部分用一个 JSON 列容纳——与 redis_connections
 * 用 nodes_json 容纳三种连接类型差异是同一手法。
 */
export interface DatastoreExtra {
  /** ES：API Key 认证（与 Basic Auth 二选一，优先 API Key）。 */
  apiKey?: string;
  /** Mongo：认证库（authSource）。 */
  authDb?: string;
}

/** 连接配置（对应 datastore_connections 一行）。 */
export interface DatastoreConnection {
  id: number;
  name: string;
  type: DatastoreType;
  /** ES 为 base URL（如 http://127.0.0.1:9200）；Mongo 为连接串（mongodb://…）。 */
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
