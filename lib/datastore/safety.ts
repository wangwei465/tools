/**
 * 数据源操作安全闸门（服务端硬编码判定，不信任前端）。
 *
 * 两级闸门，与 `lib/redis/safety.ts` 同模型：
 * - 写操作（write）：只读模式（mode=readonly）下一律拦截。
 * - 危险操作（dangerous）：任何模式下都需二次确认（confirm=true）才放行。
 *
 * 判定规则按数据源各自实现（ES 看 HTTP 方法 + 路径，Mongo 看操作名 + 过滤条件），
 * 但闸门行为统一由 gateOperation 收口。前端传来的操作意图只用于 UI 提示，
 * 不作为放行依据。
 *
 * 全部为纯函数：不依赖网络与数据库连接，可直接单测。
 */
import type { DatastoreEnv, DatastoreMode } from "./types";

/** 操作性质判定结果。dangerous 蕴含 write（危险操作必然改状态）。 */
export interface OperationClass {
  write: boolean;
  dangerous: boolean;
  /** 归类原因，随拒绝信息返回，令判定结果可解释。 */
  reason?: string;
}

const READONLY: OperationClass = { write: false, dangerous: false };

/* ─── Elasticsearch ───────────────────────────────────────── */

/**
 * 路径中形如 `_all` 的段是索引选择器而非 API 名，判定时需排除，
 * 否则 `DELETE /_all`（删除全部索引）会被误判成带子 API 的普通写。
 */
const ES_INDEX_SELECTORS = new Set(["_all"]);

/**
 * 以 POST 发起但语义只读的查询端点。
 * ES 因 DSL 体积大而用 POST 承载查询，故不能只按 HTTP 方法判定。
 */
const ES_POST_READ_APIS = new Set([
  "_search",
  "_msearch",
  "_count",
  "_explain",
  "_validate",
  "_analyze",
  "_field_caps",
  "_search_shards",
  "_mget",
  "_termvectors",
  "_mtermvectors",
  "_rank_eval",
]);

/** 拆出路径段：去查询串、去空段。 */
function esPathSegments(path: string): string[] {
  return (path.split("?")[0] ?? "")
    .split("/")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * 判定 ES 操作性质。
 *
 * - GET / HEAD 一律只读——ES 没有带副作用的 GET 端点。
 * - POST 打到查询端点（`_search` 等）只读。
 * - `_delete_by_query` 危险：按条件批量删文档，等价于无 WHERE 保护的批量删除。
 * - DELETE 一律危险，唯独 `_doc` / `_source` 的单文档删除按普通写。
 * - `_close` 关闭索引使其不可读写，属结构变更，危险。
 * - 其余写方法（POST / PUT / PATCH）为普通写。
 */
export function classifyEsOperation(method: string, path: string): OperationClass {
  const m = (method || "GET").trim().toUpperCase();
  const segs = esPathSegments(path);
  const apis = segs.filter((s) => s.startsWith("_") && !ES_INDEX_SELECTORS.has(s));
  const target = segs.length ? `/${segs.join("/")}` : "/";

  if (m === "GET" || m === "HEAD") return READONLY;

  if (apis.includes("_delete_by_query")) {
    return { write: true, dangerous: true, reason: `按查询批量删除 ${target} 的文档` };
  }

  if (m === "POST" && apis.some((a) => ES_POST_READ_APIS.has(a))) return READONLY;

  if (m === "DELETE") {
    if (apis.includes("_doc") || apis.includes("_source")) {
      return { write: true, dangerous: false, reason: `删除单个文档 ${target}` };
    }
    return {
      write: true,
      dangerous: true,
      reason: apis.length === 0 ? `删除索引 ${target}` : `删除 ${target}`,
    };
  }

  if (apis.includes("_close")) {
    return { write: true, dangerous: true, reason: `关闭索引 ${target}，关闭后不可读写` };
  }

  if (apis.includes("_update_by_query")) {
    return { write: true, dangerous: false, reason: `按查询批量更新 ${target} 的文档` };
  }

  return { write: true, dangerous: false, reason: `${m} ${target} 会修改数据或结构` };
}

/* ─── MongoDB ─────────────────────────────────────────────── */

/** 只读操作。 */
const MONGO_READ_OPS = new Set([
  "find",
  "findOne",
  "aggregate",
  "count",
  "countDocuments",
  "estimatedDocumentCount",
  "distinct",
  "listCollections",
  "listDatabases",
  "listIndexes",
]);

/** 危险操作：删库删集合删索引等结构变更，任何模式都需确认。 */
const MONGO_DANGEROUS_OPS = new Set([
  "drop",
  "dropDatabase",
  "dropIndex",
  "dropIndexes",
  "renameCollection",
]);

/** 过滤条件为空对象（或缺失）——等价于 SQL 里没有 WHERE。 */
function isEmptyFilter(filter: unknown): boolean {
  if (filter === null || filter === undefined) return true;
  if (typeof filter !== "object" || Array.isArray(filter)) return false;
  return Object.keys(filter as Record<string, unknown>).length === 0;
}

/** 过滤条件为空时升级为危险的批量操作。 */
const MONGO_BULK_OPS = new Set(["deleteMany", "updateMany"]);

/**
 * 判定 MongoDB 操作性质。
 *
 * `deleteMany` / `updateMany` 在过滤条件为空对象时升级为危险——这是 Mongo
 * 特有的「全表误伤」模式；带条件时为普通写，读写模式下无需二次确认。
 * 未收录的操作名按写处理（保守兜底：操作名来自本工具自身的封闭枚举，
 * 出现未知值意味着调用方有误，不应放行）。
 */
export function classifyMongoOperation(op: string, filter?: unknown): OperationClass {
  const name = (op || "").trim();

  if (MONGO_READ_OPS.has(name)) return READONLY;

  if (MONGO_DANGEROUS_OPS.has(name)) {
    return { write: true, dangerous: true, reason: `${name} 会删除数据或结构，不可恢复` };
  }

  if (MONGO_BULK_OPS.has(name)) {
    if (isEmptyFilter(filter)) {
      return {
        write: true,
        dangerous: true,
        reason: `${name} 的过滤条件为空，将影响集合内全部文档`,
      };
    }
    return { write: true, dangerous: false, reason: `${name} 会按条件批量修改文档` };
  }

  return { write: true, dangerous: false, reason: `${name} 按写操作处理` };
}

/* ─── 统一闸门 ────────────────────────────────────────────── */

/** 闸门判定结果：allowed 为 false 时 blocked / needConfirm 二选一成立。 */
export interface GateResult {
  allowed: boolean;
  /** 被只读模式拦截。 */
  blocked?: "readonly";
  /** 需二次确认。 */
  needConfirm?: boolean;
  error?: string;
  /** 待确认操作的完整描述，供确认弹窗回显。 */
  description?: string;
}

export interface GateInput {
  cls: OperationClass;
  conn: { name: string; env: DatastoreEnv; mode: DatastoreMode };
  /** 将要执行的完整操作串（如 `POST /idx/_search` 或 `deleteMany({})`）。 */
  description: string;
  confirm?: boolean;
}

const ALLOWED: GateResult = { allowed: true };

/**
 * 统一闸门：先拦只读模式下的写操作，再拦未确认的危险操作。
 * 两类拒绝都带上归类原因，令判定结果对用户可解释。
 */
export function gateOperation({ cls, conn, description, confirm }: GateInput): GateResult {
  if (conn.mode === "readonly" && cls.write) {
    return {
      allowed: false,
      blocked: "readonly",
      error: `当前连接「${conn.name}」为只读模式，禁止执行写操作：${cls.reason ?? description}`,
      description,
    };
  }

  if (cls.dangerous && !confirm) {
    return {
      allowed: false,
      needConfirm: true,
      error: `危险操作：${cls.reason ?? description}。确认在「${conn.name}」（${conn.env}）执行？`,
      description,
    };
  }

  return { ...ALLOWED, description };
}
