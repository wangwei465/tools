import {
  isRecord,
  opWhere,
  pushIssue,
  type ApiDocModel,
  type ApiOperation,
  type ApiServer,
  type ImportIssue,
} from "./types";
import { RefResolver } from "./ref";
import { sampleBodyText } from "./sample";
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
 * Swagger 2.0 读取器（api-openapi-import ④b）。
 *
 * 与 3.x 的差异集中在四处：服务地址由 `host` + `basePath` + `schemes` 组装、
 * 请求体是 `in: body` 参数、schema 定义在 `definitions`、安全方案在 `securityDefinitions`。
 * 归一化后产出同一个 `ApiDocModel`，下游对版本无感。
 */

/** schemes 缺省值：文档未声明时按 http 处理（本工具面向的内网服务多为 http）。 */
const DEFAULT_SCHEMES = ["http"];

function readServers(doc: Record<string, unknown>): ApiServer[] {
  const host = typeof doc.host === "string" ? doc.host.trim() : "";
  if (!host) return [];

  const basePath = typeof doc.basePath === "string" ? trimTrailingSlash(doc.basePath.trim()) : "";
  const schemes = (
    Array.isArray(doc.schemes) ? doc.schemes.filter((s) => typeof s === "string") : []
  ) as string[];
  const list = schemes.length > 0 ? schemes : DEFAULT_SCHEMES;

  // 多协议时把 scheme 写进描述，避免两个环境都以 host 命名而互相顶掉
  return list.map((scheme) => ({
    url: `${scheme}://${host}${basePath}`,
    description: list.length > 1 ? `${host} (${scheme})` : "",
  }));
}

/**
 * 请求体：`in: body` 参数的 schema 生成示例；`in: formData` 首版不支持，降级为空 body。
 */
function readBody(
  params: Record<string, unknown>[],
  r: RefResolver,
  where: string,
  issues: ImportIssue[]
): string | null {
  const body = params.find((p) => p.in === "body");
  if (body) return sampleBodyText(body.schema, r, where);

  if (params.some((p) => p.in === "formData")) {
    pushIssue(issues, {
      type: "body-unsupported",
      where,
      message: "表单请求体（formData）首版不支持，已生成空 Body",
    });
  }
  return null;
}

export function readV2(doc: Record<string, unknown>): ApiDocModel {
  const issues: ImportIssue[] = [];
  const r = new RefResolver(doc, issues);
  const schemes = resolveSchemes(doc.securityDefinitions, r, "securityDefinitions");

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
        bodyRaw: readBody(params, r, where, issues),
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
