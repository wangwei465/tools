/**
 * Elasticsearch 访问层：用 Node 内置 fetch 直连其 REST API，不引入官方客户端。
 *
 * 理由（design.md 决策二）：`@elastic/elasticsearch` 把 `compatible-with=N` 硬编码进
 * Accept / Content-Type 且无选项可改，装哪个大版本就把能连的集群锁死在哪个大版本；
 * 而排查工具最需要的恰恰是「手上这堆新旧集群都能连」。用 fetch 后零新增依赖，
 * 天然兼容 ES 6/7/8/9 与 OpenSearch，请求响应就是 Kibana Dev Tools 里的原始 JSON。
 *
 * 代价是要自己处理认证头与错误响应形状——集中在本文件的 esRequest / describeEsError。
 * 响应解析拆成纯函数（parseCatIndices / parseMapping / parseSearchResponse），
 * 可用不同版本的响应样本直接单测。
 */
import { parseExtra, type DatastoreConnection, type EsField, type EsIndexInfo, type EsSearchResult } from "./types";

/** 默认请求超时：排查工具宁可快速失败也不让页面长时间空转。 */
const DEFAULT_TIMEOUT_MS = 15000;

/** 一次 ES 请求的结果（HTTP 层成功即返回，业务错误由调用方按 status 判读）。 */
export interface EsResponse {
  ok: boolean;
  status: number;
  body: unknown;
  tookMs: number;
}

/* ─── 请求 ────────────────────────────────────────────────── */

/**
 * 认证头：API Key 优先于 Basic Auth（两者都配时以 API Key 为准）。
 * 首版仅覆盖这两种，Bearer / PKI 待实际环境需要再补。
 */
function authHeaders(conn: DatastoreConnection): Record<string, string> {
  const apiKey = parseExtra(conn.extraJson).apiKey?.trim();
  if (apiKey) return { Authorization: `ApiKey ${apiKey}` };
  if (conn.username) {
    const encoded = Buffer.from(`${conn.username}:${conn.password}`).toString("base64");
    return { Authorization: `Basic ${encoded}` };
  }
  return {};
}

/** 拼接 base URL 与路径，容忍两侧各自带或不带斜杠。 */
export function joinEsUrl(baseUri: string, path: string): string {
  const base = baseUri.trim().replace(/\/+$/, "");
  const rel = path.trim().replace(/^\/+/, "");
  return rel ? `${base}/${rel}` : `${base}/`;
}

/**
 * 把网络层异常归一化为可读原因。
 * Node 的 fetch 会把底层错误包成 TypeError，真实原因在 cause.code 里。
 */
function normalizeFetchError(err: unknown, timeoutMs: number): string {
  if (err instanceof Error && err.name === "AbortError") {
    return `请求超时（>${Math.round(timeoutMs / 1000)}s）`;
  }
  const code = (err as { cause?: { code?: string } })?.cause?.code;
  switch (code) {
    case "ECONNREFUSED":
      return "地址不可达：目标端口拒绝连接";
    case "ENOTFOUND":
    case "EAI_AGAIN":
      return "地址不可达：域名解析失败";
    case "ETIMEDOUT":
      return `连接超时（>${Math.round(timeoutMs / 1000)}s）`;
    case "CERT_HAS_EXPIRED":
    case "UNABLE_TO_VERIFY_LEAF_SIGNATURE":
    case "DEPTH_ZERO_SELF_SIGNED_CERT":
      return "TLS 证书校验失败";
    default:
      return err instanceof Error ? err.message : "请求失败";
  }
}

/**
 * 发起一次 ES 请求。
 * 网络层失败抛出带可读中文原因的 Error；HTTP 层非 2xx 不抛出，
 * 由调用方结合 body 决定如何呈现（ES 的错误体本身就是有用的排查信息）。
 */
export async function esRequest(
  conn: DatastoreConnection,
  method: string,
  path: string,
  body?: unknown,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<EsResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const start = Date.now();

  try {
    const res = await fetch(joinEsUrl(conn.uri, path), {
      method: method.toUpperCase(),
      headers: {
        Accept: "application/json",
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...authHeaders(conn),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      signal: controller.signal,
    });

    const text = await res.text();
    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      /* 非 JSON 响应原样保留文本 */
    }
    return { ok: res.ok, status: res.status, body: parsed, tookMs: Date.now() - start };
  } catch (err) {
    throw new Error(normalizeFetchError(err, timeoutMs));
  } finally {
    clearTimeout(timer);
  }
}

/* ─── 错误解释 ────────────────────────────────────────────── */

/** ES 深分页上限触顶的特征串（各版本措辞一致）。 */
const DEEP_PAGINATION_MARK = "Result window is too large";

/**
 * 把 ES 的错误响应翻译成可读原因。
 * 深分页触顶单独识别：说明原因并给出出路，而不是把底层堆栈甩给用户。
 */
export function describeEsError(status: number, body: unknown): string {
  const detail = extractEsErrorDetail(body);

  if (detail.includes(DEEP_PAGINATION_MARK) || detail.includes("max_result_window")) {
    return "已超出集群的深分页上限（max_result_window，默认 10000 条）。请缩小过滤条件，或改用 search_after 遍历。";
  }

  switch (status) {
    case 401:
      return `认证失败：用户名密码或 API Key 不正确${detail ? `（${detail}）` : ""}`;
    case 403:
      return `无权限访问该资源${detail ? `（${detail}）` : ""}`;
    case 404:
      return `资源不存在${detail ? `（${detail}）` : ""}`;
    default:
      return detail || `请求失败（HTTP ${status}）`;
  }
}

/** 从 ES 错误体中抽出 reason；形状不认识时回落为 JSON 片段。 */
function extractEsErrorDetail(body: unknown): string {
  if (typeof body === "string") return body.slice(0, 500);
  if (!body || typeof body !== "object") return "";

  const error = (body as { error?: unknown }).error;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const e = error as { type?: string; reason?: string; caused_by?: { reason?: string } };
    const parts = [e.reason, e.caused_by?.reason].filter(Boolean);
    if (parts.length) return `${e.type ? `${e.type}: ` : ""}${parts.join(" / ")}`;
    if (e.type) return e.type;
  }
  try {
    return JSON.stringify(body).slice(0, 500);
  } catch {
    return "";
  }
}

/* ─── 连通性 ──────────────────────────────────────────────── */

/** `GET /` 的版本信息。 */
export interface EsServerInfo {
  version: string;
  clusterName: string;
  distribution: string; // elasticsearch | opensearch | ""
}

/** 探测集群：取版本号用于连接测试回显。 */
export async function esPing(conn: DatastoreConnection, timeoutMs?: number): Promise<EsServerInfo> {
  const res = await esRequest(conn, "GET", "/", undefined, timeoutMs);
  if (!res.ok) throw new Error(describeEsError(res.status, res.body));

  const body = (res.body ?? {}) as {
    version?: { number?: string; distribution?: string };
    cluster_name?: string;
  };
  return {
    version: body.version?.number ?? "未知",
    clusterName: body.cluster_name ?? "",
    distribution: body.version?.distribution ?? "elasticsearch",
  };
}

/* ─── 索引列表 ────────────────────────────────────────────── */

/** `_cat/indices` 只取需要的列，避免大集群上返回量爆炸。 */
const CAT_INDICES_PATH =
  "/_cat/indices?format=json&h=index,health,status,docs.count,store.size&s=index";

/** 把 `_cat/indices?format=json` 的行解析为索引信息（缺列按空值兜底）。 */
export function parseCatIndices(rows: unknown): EsIndexInfo[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((r): r is Record<string, unknown> => !!r && typeof r === "object")
    .map((r) => ({
      index: String(r.index ?? ""),
      health: String(r.health ?? ""),
      status: String(r.status ?? ""),
      docsCount: Number(r["docs.count"] ?? 0) || 0,
      storeSize: String(r["store.size"] ?? ""),
    }))
    .filter((r) => r.index !== "");
}

export async function esListIndices(conn: DatastoreConnection): Promise<EsIndexInfo[]> {
  const res = await esRequest(conn, "GET", CAT_INDICES_PATH);
  if (!res.ok) throw new Error(describeEsError(res.status, res.body));
  return parseCatIndices(res.body);
}

/* ─── Mapping ─────────────────────────────────────────────── */

/**
 * 从 `GET /{index}/_mapping` 的响应中定位 properties。
 * 兼容两种版本形状：
 * - 7.x+：`{ idx: { mappings: { properties } } }`
 * - 6.x ：`{ idx: { mappings: { <type>: { properties } } } }`（mapping type 时代）
 * 索引名可能是别名或通配符，响应键与请求名不一致时取第一个键。
 */
function locateProperties(body: unknown, index: string): Record<string, unknown> | null {
  if (!body || typeof body !== "object") return null;
  const root = body as Record<string, unknown>;
  const entry = (root[index] ?? Object.values(root)[0]) as { mappings?: unknown } | undefined;
  const mappings = entry?.mappings;
  if (!mappings || typeof mappings !== "object") return null;

  const m = mappings as Record<string, unknown>;
  if (m.properties && typeof m.properties === "object") {
    return m.properties as Record<string, unknown>;
  }
  // 6.x：mappings 下先是一层 mapping type
  for (const value of Object.values(m)) {
    if (value && typeof value === "object" && "properties" in (value as object)) {
      const props = (value as { properties?: unknown }).properties;
      if (props && typeof props === "object") return props as Record<string, unknown>;
    }
  }
  return null;
}

/** 递归展开 properties 为字段树，保留 object / nested 层级与字段类型。 */
function walkProperties(props: Record<string, unknown>, prefix: string): EsField[] {
  return Object.entries(props)
    .map(([name, rawDef]) => {
      const def = (rawDef ?? {}) as { type?: string; properties?: Record<string, unknown> };
      const path = prefix ? `${prefix}.${name}` : name;
      const children = def.properties ? walkProperties(def.properties, path) : undefined;
      return {
        name,
        path,
        // 无显式 type 但有 properties 的节点即隐式 object
        type: def.type ?? (children ? "object" : "unknown"),
        ...(children && children.length ? { children } : {}),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** 解析 mapping 为字段树；无字段定义时返回空数组（由 UI 呈现空状态）。 */
export function parseMapping(body: unknown, index: string): EsField[] {
  const props = locateProperties(body, index);
  return props ? walkProperties(props, "") : [];
}

export async function esGetMapping(
  conn: DatastoreConnection,
  index: string
): Promise<EsField[]> {
  const res = await esRequest(conn, "GET", `/${encodeURIComponent(index)}/_mapping`);
  if (!res.ok) throw new Error(describeEsError(res.status, res.body));
  return parseMapping(res.body, index);
}

/* ─── 查询响应解析 ────────────────────────────────────────── */

/**
 * 解析 `hits.total`，兼容两种版本形状：
 * - 7.x 前：数字
 * - 7.x 后：`{ value, relation }`（relation=gte 表示「至少」）
 * 无法识别时返回 null。
 */
export function parseHitsTotal(total: unknown): { value: number; relation: string } | null {
  if (typeof total === "number") return { value: total, relation: "eq" };
  if (total && typeof total === "object") {
    const t = total as { value?: unknown; relation?: unknown };
    if (typeof t.value === "number") {
      return { value: t.value, relation: typeof t.relation === "string" ? t.relation : "eq" };
    }
  }
  return null;
}

/**
 * 解析 `_search` 响应。
 * 结构无法按预期解析时不报错，而是 parsed=false 回落原始 JSON——
 * 保证跨版本 / 非查询响应「至少能看到东西」。
 */
export function parseSearchResponse(body: unknown): EsSearchResult {
  const fallback: EsSearchResult = {
    parsed: false,
    total: 0,
    relation: "eq",
    tookMs: 0,
    docs: [],
    raw: body,
  };
  if (!body || typeof body !== "object") return fallback;

  const b = body as { took?: unknown; hits?: unknown };
  const hits = b.hits as { total?: unknown; hits?: unknown } | undefined;
  if (!hits || typeof hits !== "object" || !Array.isArray(hits.hits)) return fallback;

  const total = parseHitsTotal(hits.total);
  const docs = hits.hits
    .filter((h): h is Record<string, unknown> => !!h && typeof h === "object")
    .map((h) => {
      const source = h._source && typeof h._source === "object" ? h._source : {};
      return { _id: h._id, _index: h._index, ...(source as Record<string, unknown>) };
    });

  return {
    parsed: true,
    total: total?.value ?? docs.length,
    relation: total?.relation ?? "eq",
    tookMs: typeof b.took === "number" ? b.took : 0,
    docs,
    raw: body,
  };
}
