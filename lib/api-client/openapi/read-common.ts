import { HTTP_METHODS, type HttpMethod } from "@/components/api-client/types";
import { isRecord, pushIssue, type ApiAuth, type ApiParam, type ImportIssue } from "./types";
import { RefResolver } from "./ref";
import { sampleParamValue } from "./sample";

/**
 * 两代读取器的共用逻辑（api-openapi-import ④b）。
 *
 * query / header 参数提取与安全方案映射在 2.0 与 3.x 之间只有字段位置的差别，
 * 收敛于此以免 `read-v2` / `read-v3` 各写一遍。对未知字段一律忽略而非报错——
 * 真实文档里的厂商扩展（`x-*`）与非标准写法太多，报错等于拒绝导入。
 */

/** `paths[*]` 下被视作操作的键（小写 HTTP 方法）。 */
export const METHOD_KEYS: string[] = HTTP_METHODS.map((m) => m.toLowerCase());

/** 小写方法键 → HttpMethod。 */
export function toHttpMethod(key: string): HttpMethod {
  return key.toUpperCase() as HttpMethod;
}

/** 展开 parameters 列表：过滤非对象、解析其中的 `$ref`。 */
export function resolveParams(
  params: unknown,
  r: RefResolver,
  where: string
): Record<string, unknown>[] {
  if (!Array.isArray(params)) return [];
  const out: Record<string, unknown>[] = [];
  for (const raw of params) {
    if (!isRecord(raw)) continue;
    if (typeof raw.$ref === "string") {
      const target = r.resolve(raw.$ref, where);
      if (isRecord(target)) out.push(target);
      continue;
    }
    out.push(raw);
  }
  return out;
}

/** 参数的取值来源：3.x 放在 `schema` 里，2.0 直接摊在参数对象上。 */
function paramValue(p: Record<string, unknown>, r: RefResolver, where: string): string {
  if (p.example !== undefined) return sampleParamValue({ example: p.example }, r, where);
  return sampleParamValue(isRecord(p.schema) ? p.schema : p, r, where);
}

/**
 * 提取 query 与 header 参数。
 * 同名参数后者覆盖前者（操作级 parameters 覆盖 path 级，符合规范）；
 * `in: path` 保留在 URL 中不单列，`in: cookie` 与其余位置忽略。
 */
export function collectParams(
  resolved: Record<string, unknown>[],
  r: RefResolver,
  where: string
): { query: ApiParam[]; headers: ApiParam[] } {
  const query = new Map<string, string>();
  const headers = new Map<string, string>();

  for (const p of resolved) {
    const name = typeof p.name === "string" ? p.name.trim() : "";
    if (!name) continue;
    const bucket = p.in === "query" ? query : p.in === "header" ? headers : null;
    if (!bucket) continue;
    bucket.set(name, paramValue(p, r, where));
  }

  const toList = (m: Map<string, string>): ApiParam[] =>
    [...m].map(([name, value]) => ({ name, value }));
  return { query: toList(query), headers: toList(headers) };
}

/* ─── 安全方案映射 ───────────────────────────────────────── */

/**
 * 单个安全方案 → Auth 配置。
 * 覆盖 3.x 的 `http`(bearer/basic) 与 `apiKey`，以及 2.0 的 `basic` 与 `apiKey`；
 * OAuth2 / openIdConnect / apiKey-in-cookie 等无法映射，返回 null。
 */
export function mapSecurityScheme(scheme: unknown): ApiAuth | null {
  if (!isRecord(scheme)) return null;
  const type = typeof scheme.type === "string" ? scheme.type.toLowerCase() : "";

  if (type === "http") {
    const s = typeof scheme.scheme === "string" ? scheme.scheme.toLowerCase() : "";
    if (s === "bearer") return { kind: "bearer" };
    if (s === "basic") return { kind: "basic" };
    return null;
  }
  // Swagger 2.0 的 basic 是独立 type
  if (type === "basic") return { kind: "basic" };

  if (type === "apikey") {
    const name = typeof scheme.name === "string" ? scheme.name.trim() : "";
    const where = scheme.in === "query" ? "query" : scheme.in === "header" ? "header" : null;
    if (!name || !where) return null;
    return { kind: "apikey", name, in: where };
  }
  return null;
}

/** `security` 数组 → 方案名列表（取每个 requirement 对象的键）。 */
function securityNames(security: unknown): string[] {
  if (!Array.isArray(security)) return [];
  const names: string[] = [];
  for (const req of security) {
    if (!isRecord(req)) continue;
    for (const key of Object.keys(req)) if (!names.includes(key)) names.push(key);
  }
  return names;
}

/**
 * 确定一个操作的 Auth 配置。
 *
 * 取值顺序：声明的 `security`（操作级已由调用方与文档级择一传入）→ 文档只定义了唯一方案时用它。
 * 后者是为「定义了方案却没写 security」的文档兜底：此时 Auth 值为空，发送前需用户填写，
 * 但类型已就位，比留 none 更贴近文档意图。无法映射的方案记 issue 后按 none 处理。
 */
export function pickAuth(
  schemes: Record<string, unknown>,
  security: unknown,
  issues: ImportIssue[]
): ApiAuth {
  const declared = securityNames(security);
  const names =
    declared.length > 0 ? declared : Object.keys(schemes).length === 1 ? Object.keys(schemes) : [];

  for (const name of names) {
    const mapped = mapSecurityScheme(schemes[name]);
    if (mapped) return mapped;
    const type = isRecord(schemes[name]) ? String(schemes[name].type ?? "未知") : "未定义";
    pushIssue(issues, {
      type: "auth-unmappable",
      where: name,
      message: `安全方案「${name}」（${type}）无法映射到 Auth 配置，相关请求未设置鉴权`,
    });
  }
  return { kind: "none" };
}

/** 展开安全方案表（条目可能是 `$ref`）。 */
export function resolveSchemes(
  raw: unknown,
  r: RefResolver,
  where: string
): Record<string, unknown> {
  if (!isRecord(raw)) return {};
  const out: Record<string, unknown> = {};
  for (const [name, scheme] of Object.entries(raw)) {
    if (isRecord(scheme) && typeof scheme.$ref === "string") {
      out[name] = r.resolve(scheme.$ref, where);
    } else {
      out[name] = scheme;
    }
  }
  return out;
}

/** 去掉服务器地址末尾的 `/`，避免与 `{{baseUrl}}/path` 拼出双斜杠。 */
export function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}
