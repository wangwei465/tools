import { isRecord, opWhere, type ApiDocModel, type ApiOperation, type ApiServer, type ImportIssue } from "./types";
import { RefResolver } from "./ref";
import { sampleBodyFromContent } from "./sample";
import {
  METHOD_KEYS,
  collectParams,
  pickAuth,
  resolveParams,
  resolveSchemes,
  toHttpMethod,
  trimTrailingSlash,
} from "./read-common";

/**
 * OpenAPI 3.0 / 3.1 读取器（api-openapi-import ④b）。
 *
 * 读 `servers`、`components/securitySchemes`、`paths[*][method]` 与 `requestBody.content`，
 * 产出与版本无关的 `ApiDocModel`。`components/schemas` 不预读——`$ref` 由 `RefResolver`
 * 直接对整份文档解析，无需另建索引。
 */

/** 展开 server url 中的 `{var}` 模板（取 `variables[var].default`）。 */
function expandServerUrl(url: string, variables: unknown): string {
  if (!isRecord(variables)) return url;
  return url.replace(/\{([^{}]+)\}/g, (whole, name: string) => {
    const v = variables[name];
    if (isRecord(v) && (typeof v.default === "string" || typeof v.default === "number")) {
      return String(v.default);
    }
    return whole;
  });
}

function readServers(doc: Record<string, unknown>): ApiServer[] {
  if (!Array.isArray(doc.servers)) return [];
  const out: ApiServer[] = [];
  for (const raw of doc.servers) {
    if (!isRecord(raw)) continue;
    const url = trimTrailingSlash(expandServerUrl(String(raw.url ?? "").trim(), raw.variables));
    if (!url) continue;
    out.push({
      url,
      description: typeof raw.description === "string" ? raw.description.trim() : "",
    });
  }
  return out;
}

/** 请求体：`requestBody` 可能是 `$ref`，展开后取 `content` 生成示例。 */
function readBody(
  requestBody: unknown,
  r: RefResolver,
  where: string,
  issues: ImportIssue[]
): string | null {
  let body = requestBody;
  if (isRecord(body) && typeof body.$ref === "string") body = r.resolve(body.$ref, where);
  if (!isRecord(body)) return null;
  return sampleBodyFromContent(body.content, r, where, issues);
}

export function readV3(doc: Record<string, unknown>): ApiDocModel {
  const issues: ImportIssue[] = [];
  const r = new RefResolver(doc, issues);

  const components = isRecord(doc.components) ? doc.components : {};
  const schemes = resolveSchemes(components.securitySchemes, r, "components/securitySchemes");

  const operations: ApiOperation[] = [];
  const paths = isRecord(doc.paths) ? doc.paths : {};

  for (const [path, item] of Object.entries(paths)) {
    if (!isRecord(item)) continue;
    const shared = item.parameters;

    for (const key of METHOD_KEYS) {
      const op = item[key];
      if (!isRecord(op)) continue;

      const method = toHttpMethod(key);
      const where = opWhere(method, path);
      // 操作级 parameters 在后，同名时覆盖 path 级
      const params = [
        ...resolveParams(shared, r, where),
        ...resolveParams(op.parameters, r, where),
      ];
      const { query, headers } = collectParams(params, r, where);
      const tags = Array.isArray(op.tags) ? op.tags.filter((t) => typeof t === "string") : [];

      operations.push({
        method,
        path,
        group: tags.length > 0 ? String(tags[0]).trim() || null : null,
        summary: typeof op.summary === "string" ? op.summary.trim() : "",
        operationId: typeof op.operationId === "string" ? op.operationId.trim() : "",
        query,
        headers,
        bodyRaw: readBody(op.requestBody, r, where, issues),
        auth: pickAuth(schemes, op.security ?? doc.security, issues),
      });
    }
  }

  const info = isRecord(doc.info) ? doc.info : {};
  return {
    title: typeof info.title === "string" ? info.title.trim() : "",
    servers: readServers(doc),
    operations,
    issues,
  };
}
