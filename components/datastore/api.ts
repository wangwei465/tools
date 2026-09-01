"use client";

/**
 * 数据源·前端 API 封装。
 * 统一 JSON 信封，返回 { ok, ... } 或 { ok:false, error }。
 * 类型复用 lib/datastore/types（纯数据类型，无服务端依赖）。
 */
import type {
  DatastoreConnection,
  DatastoreConnectionInput,
  EsField,
  EsIndexInfo,
  EsSearchResult,
  MongoCollectionInfo,
  MongoDatabaseInfo,
  MongoFieldSampleResult,
  MongoIndexInfo,
  RdbExecResult,
  RdbTableDetail,
  RdbTableInfo,
} from "@/lib/datastore/types";

async function req<T>(url: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return (await res.json()) as T;
}

const post = <T,>(url: string, body: unknown) => req<T>(url, "POST", body);

/** 闸门拒绝信息：只读拦截与危险操作确认共用的信封字段。 */
export interface GateEnvelope {
  ok: boolean;
  error?: string;
  blocked?: "readonly";
  needConfirm?: boolean;
  /** 待确认操作的完整描述，供确认弹窗回显。 */
  description?: string;
}

/** ES 查询台入参：方法 + 路径 + JSON Body，与 Kibana Dev Tools 心智一致。 */
export interface EsQueryInput {
  connId: number;
  method: string;
  path: string;
  body?: unknown;
  confirm?: boolean;
}

/** Mongo 查询台支持的操作：前两个为读，后两个为写（写操作靠手写条件提交）。 */
export type MongoOp = "find" | "aggregate" | "updateMany" | "deleteMany";

/** Mongo 查询台入参：find / aggregate 两种输入形态，写操作复用 filter。 */
export interface MongoQueryInput {
  connId: number;
  db: string;
  collection: string;
  op: MongoOp;
  filter?: unknown;
  projection?: unknown;
  sort?: unknown;
  skip?: number;
  limit?: number;
  pipeline?: unknown;
  update?: unknown;
  confirm?: boolean;
}

/** 关系型查询台入参：一次一条 SQL，多语句由服务端拒绝。 */
export interface RdbQueryInput {
  connId: number;
  sql: string;
  confirm?: boolean;
}

export const datastoreApi = {
  /* ─── 连接管理 ─────────────────────────────── */

  async listConnections(): Promise<DatastoreConnection[]> {
    const r = await fetch("/api/datastore/connections").then((x) => x.json());
    return r.ok ? (r.connections as DatastoreConnection[]) : [];
  },

  createConnection(input: DatastoreConnectionInput) {
    return post<{ ok: boolean; connection?: DatastoreConnection; error?: string }>(
      "/api/datastore/connections",
      input
    );
  },

  updateConnection(id: number, input: DatastoreConnectionInput) {
    return req<{ ok: boolean; connection?: DatastoreConnection; error?: string }>(
      `/api/datastore/connections/${id}`,
      "PATCH",
      input
    );
  },

  deleteConnection(id: number) {
    return req<{ ok: boolean; error?: string }>(
      `/api/datastore/connections/${id}`,
      "DELETE"
    );
  },

  testConnection(input: DatastoreConnectionInput & { id?: number }) {
    return post<{ ok: boolean; version?: string; latencyMs?: number; error?: string }>(
      "/api/datastore/test",
      input
    );
  },

  /* ─── 目录浏览 ─────────────────────────────── */

  esIndices(connId: number) {
    return post<{ ok: boolean; indices?: EsIndexInfo[]; error?: string }>(
      "/api/datastore/catalog",
      { connId, kind: "esIndices" }
    );
  },

  esMapping(connId: number, index: string) {
    return post<{ ok: boolean; fields?: EsField[]; error?: string }>("/api/datastore/catalog", {
      connId,
      kind: "esMapping",
      index,
    });
  },

  mongoDatabases(connId: number) {
    return post<{ ok: boolean; databases?: MongoDatabaseInfo[]; error?: string }>(
      "/api/datastore/catalog",
      { connId, kind: "mongoDatabases" }
    );
  },

  mongoCollections(connId: number, db: string) {
    return post<{ ok: boolean; collections?: MongoCollectionInfo[]; error?: string }>(
      "/api/datastore/catalog",
      { connId, kind: "mongoCollections", db }
    );
  },

  mongoFields(connId: number, db: string, collection: string) {
    return post<{ ok: boolean; sample?: MongoFieldSampleResult; error?: string }>(
      "/api/datastore/catalog",
      { connId, kind: "mongoFields", db, collection }
    );
  },

  mongoIndexes(connId: number, db: string, collection: string) {
    return post<{ ok: boolean; indexes?: MongoIndexInfo[]; error?: string }>(
      "/api/datastore/catalog",
      { connId, kind: "mongoIndexes", db, collection }
    );
  },

  /* ─── 关系型目录（按层懒加载）───────────────── */

  rdbDatabases(connId: number) {
    return post<{ ok: boolean; databases?: string[]; error?: string }>(
      "/api/datastore/catalog",
      { connId, kind: "rdbDatabases" }
    );
  },

  rdbSchemas(connId: number, db: string) {
    return post<{ ok: boolean; schemas?: string[]; error?: string }>("/api/datastore/catalog", {
      connId,
      kind: "rdbSchemas",
      db,
    });
  },

  rdbTables(connId: number, db: string, schema: string) {
    return post<{ ok: boolean; tables?: RdbTableInfo[]; error?: string }>(
      "/api/datastore/catalog",
      { connId, kind: "rdbTables", db, schema }
    );
  },

  rdbTable(connId: number, db: string, schema: string, table: string) {
    return post<{ ok: boolean; detail?: RdbTableDetail; error?: string }>(
      "/api/datastore/catalog",
      { connId, kind: "rdbTable", db, schema, table }
    );
  },

  /* ─── 查询台 ───────────────────────────────── */

  esQuery(input: EsQueryInput) {
    return post<GateEnvelope & { result?: EsSearchResult; tookMs?: number }>(
      "/api/datastore/query",
      { ...input, kind: "es" }
    );
  },

  mongoQuery(input: MongoQueryInput) {
    return post<
      GateEnvelope & { docs?: Array<Record<string, unknown>>; tookMs?: number }
    >("/api/datastore/query", { ...input, kind: "mongo" });
  },

  rdbQuery(input: RdbQueryInput) {
    return post<GateEnvelope & { result?: RdbExecResult }>("/api/datastore/query", {
      ...input,
      kind: "rdb",
    });
  },
};
