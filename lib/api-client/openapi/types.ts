import type { HttpMethod } from "@/components/api-client/types";

/**
 * OpenAPI / Swagger 导入的归一化中间模型（api-openapi-import ④b）。
 *
 * 与文档版本无关：`read-v2.ts` 与 `read-v3.ts` 各自把原始文档读成本模型，
 * 下游的分组、建树与环境生成只认本模型，对 2.0 / 3.x 的结构差异完全无感。
 * 纯类型 + 无副作用工具，可被解析层、API 路由与客户端组件同时 import。
 */

/* ─── 降级项（导入报告的条目）─────────────────────────────── */

/** 降级类型；导入报告按此分组展示。 */
export type ImportIssueType =
  | "missing-tag" // 无 tag，按 path 首段分组
  | "path-param" // 含 {id} 形式的路径参数，需手工替换
  | "ref-external" // $ref 指向外部文件 / URL，不解析
  | "ref-missing" // $ref 指向文档内不存在的路径
  | "ref-cycle" // 循环引用，截断为占位
  | "depth-limit" // schema 嵌套超出深度上限，截断
  | "body-unsupported" // 请求体内容类型不受支持（表单等）
  | "auth-unmappable" // 安全方案无法映射到 Auth 配置（OAuth2 等）
  | "no-server" // 文档未定义任何服务器地址
  | "env-renamed"; // 环境重名，以带后缀名称创建

/** 降级类型的中文标题（报告分组用）。 */
export const ISSUE_TITLES: Record<ImportIssueType, string> = {
  "missing-tag": "缺少 tag，按路径分组",
  "path-param": "含路径参数，需手工替换",
  "ref-external": "外部引用未解析",
  "ref-missing": "引用断链",
  "ref-cycle": "循环引用已截断",
  "depth-limit": "嵌套超出深度上限",
  "body-unsupported": "请求体类型不受支持",
  "auth-unmappable": "安全方案无法映射",
  "no-server": "缺少服务器地址",
  "env-renamed": "环境重名，已改用新名称",
};

export interface ImportIssue {
  type: ImportIssueType;
  /** 位置：操作的 `METHOD /path`、schema 引用路径或环境名；聚合类条目为空串。 */
  where: string;
  message: string;
}

/** 追加降级项；同 type + where 只记一条（循环引用会被反复命中）。 */
export function pushIssue(issues: ImportIssue[], issue: ImportIssue): void {
  if (issues.some((i) => i.type === issue.type && i.where === issue.where)) return;
  issues.push(issue);
}

/* ─── 归一化模型 ─────────────────────────────────────────── */

/** 服务器地址（3.x 的 servers 项，或 2.0 的 schemes × host + basePath）。 */
export interface ApiServer {
  url: string;
  description: string;
}

/** 归一化后的鉴权配置；映射自 securitySchemes / securityDefinitions。 */
export type ApiAuth =
  | { kind: "none" }
  | { kind: "bearer" }
  | { kind: "basic" }
  | { kind: "apikey"; name: string; in: "header" | "query" };

/** query / header 参数：名称 + 占位或默认值。 */
export interface ApiParam {
  name: string;
  value: string;
}

/** 一个操作（一条 path + method）。 */
export interface ApiOperation {
  method: HttpMethod;
  /** 原样 path，保留 `{id}` 形式的路径参数；basePath 已并入服务器地址。 */
  path: string;
  /** 第一个 tag；缺失为 null，由下游按 path 首段回退。 */
  group: string | null;
  summary: string;
  operationId: string;
  query: ApiParam[];
  headers: ApiParam[];
  /** 请求体示例 JSON 文本；null = 无请求体。 */
  bodyRaw: string | null;
  auth: ApiAuth;
}

/** 归一化文档模型。 */
export interface ApiDocModel {
  /** info.title，缺失为空串（由下游兜底命名）。 */
  title: string;
  servers: ApiServer[];
  operations: ApiOperation[];
  /** 读取过程中产生的降级项。 */
  issues: ImportIssue[];
}

/* ─── 通用工具 ───────────────────────────────────────────── */

/** 请求 URL 前缀所用的变量名；解析层与写入层共用。 */
export const BASE_URL_VAR = "baseUrl";

/** 取不与 taken 冲突的名称：占用时依次尝试 `名称 (2)`、`名称 (3)`。 */
export function uniqueName(base: string, taken: Iterable<string>): string {
  const set = taken instanceof Set ? (taken as Set<string>) : new Set(taken);
  if (!set.has(base)) return base;
  let i = 2;
  while (set.has(`${base} (${i})`)) i++;
  return `${base} (${i})`;
}

/** 判定为可索引的普通对象（排除 null 与数组）。 */
export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** 操作的位置标识，用于降级项的 `where`。 */
export function opWhere(method: string, path: string): string {
  return `${method.toUpperCase()} ${path}`;
}
