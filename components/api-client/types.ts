/**
 * 接口调试工具的核心类型与工厂。
 *
 * 纯类型 + 无副作用工厂，前后端共用（后端代理复用 Wire* 类型）。
 * 本文件不含 "use client"，可被 API route 与客户端组件同时 import。
 */

/* ─── HTTP 方法 ──────────────────────────────────────────── */

export type HttpMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "DELETE"
  | "PATCH"
  | "HEAD"
  | "OPTIONS";

export const HTTP_METHODS: HttpMethod[] = [
  "GET",
  "POST",
  "PUT",
  "DELETE",
  "PATCH",
  "HEAD",
  "OPTIONS",
];

/** 不携带请求体的方法。 */
export const BODYLESS_METHODS = new Set<HttpMethod>(["GET", "HEAD"]);

/* ─── 键值行（Params / Headers / urlencoded 复用）─────────── */

export interface KV {
  key: string;
  value: string;
  enabled: boolean;
}

export const emptyKV = (): KV => ({ key: "", value: "", enabled: true });

/* ─── 请求体 ─────────────────────────────────────────────── */

export type BodyType = "none" | "raw" | "form-data" | "urlencoded";

/** form-data 单个字段：文本或文件。文件以 base64 内存态承载，不持久化。 */
export interface FormField {
  key: string;
  kind: "text" | "file";
  value: string; // 文本值（kind=text 时有效）
  fileName?: string; // 文件名（kind=file，仅展示）
  fileBase64?: string; // 文件内容 base64（kind=file，内存态）
  enabled: boolean;
}

export const emptyFormField = (): FormField => ({
  key: "",
  kind: "text",
  value: "",
  enabled: true,
});

export interface BodyState {
  type: BodyType;
  raw: string; // raw(JSON) 文本
  formData: FormField[];
  urlencoded: KV[];
}

/* ─── 认证 ───────────────────────────────────────────────── */

export type AuthType = "none" | "bearer" | "basic" | "apikey";

export interface AuthState {
  type: AuthType;
  bearerToken: string;
  basicUser: string;
  basicPassword: string;
  apiKeyName: string;
  apiKeyValue: string;
  apiKeyIn: "header" | "query";
}

/* ─── 请求草稿（一个 tab 的可编辑请求）───────────────────── */

export interface RequestDraft {
  method: HttpMethod;
  url: string; // 完整 URL（含 query，作为发送真相；params 为其解析视图）
  params: KV[]; // Query 参数表格（URL query 的结构化视图）
  headers: KV[];
  body: BodyState;
  auth: AuthState;
}

export function emptyRequest(): RequestDraft {
  return {
    method: "GET",
    url: "",
    params: [],
    headers: [],
    body: { type: "none", raw: "", formData: [], urlencoded: [] },
    auth: {
      type: "none",
      bearerToken: "",
      basicUser: "",
      basicPassword: "",
      apiKeyName: "",
      apiKeyValue: "",
      apiKeyIn: "header",
    },
  };
}

/* ─── 响应 ───────────────────────────────────────────────── */

export interface ResponseState {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string; // 原样文本
  timeMs: number;
  size: number; // 字节
  contentType: string;
  error?: string; // 网络错误 / 超时 / 超限时填充（此时其余字段无意义）
}

/* ─── Wire 信封（前端 → 后端代理 /api/request）───────────── */

export type WireBody =
  | { kind: "none" }
  | { kind: "raw"; text: string }
  | { kind: "urlencoded"; pairs: Array<[string, string]> }
  | {
      kind: "form-data";
      fields: Array<{
        key: string;
        kind: "text" | "file";
        value?: string;
        fileName?: string;
        fileBase64?: string;
      }>;
    };

export interface WireEnvelope {
  method: string;
  url: string;
  headers: Record<string, string>;
  bodyType: BodyType;
  body: WireBody;
}

/* ─── 工作台状态 ─────────────────────────────────────────── */

export interface Tab {
  id: string;
  /** 关联的 request 节点 id（null = 未保存 / 未命名请求）。 */
  nodeId: number | null;
  request: RequestDraft;
  /** dirty 判定基线：打开 / 保存 / 新建时刷新为当时的请求定义。 */
  baseline: RequestDraft;
  response: ResponseState | null;
  sending: boolean;
  dirty: boolean;
}

export interface AppState {
  tabs: Tab[];
  activeTabId: string;
  seq: number; // 自增计数，用于生成 tab id（避免 Date.now/random）
  tree: TreeNode[]; // 集合树（从 /api/collections 加载）
  history: HistoryEntry[]; // 请求历史（从 /api/history 加载）
  environments: ApiEnvironment[]; // 环境（从 /api/environments 加载）
  variables: ApiVariable[]; // 变量（从 /api/variables 加载）
  activeEnvId: number | null; // 当前激活环境（派生自 environments.is_active）
}

/* ─── 集合节点（api-collections ②）───────────────────────── */

export type NodeType = "folder" | "request";

/** 集合节点（api_nodes 一行的领域视图）。 */
export interface ApiNode {
  id: number;
  parentId: number | null; // 邻接表父指针（null = 根级）
  type: NodeType;
  name: string;
  sortOrder: number;
  definition: RequestDraft | null; // request 有；folder 为 null
  createdAt: string;
  updatedAt: string;
}

/** 树形节点（前端据 parentId 组装）。 */
export interface TreeNode extends ApiNode {
  children: TreeNode[];
}

/** 请求历史条目（api_history 一行的领域视图）。 */
export interface HistoryEntry {
  id: number;
  nodeId: number | null; // 来源节点（null = 未保存请求）
  snapshot: RequestDraft; // 请求定义快照
  status: number; // HTTP 状态码；0 = 代理层错误
  timeMs: number;
  size: number;
  createdAt: string;
}

/* ─── 环境与变量（api-environments ③）────────────────────── */

/** 环境（api_environments 一行）。同一时刻至多一个 isActive。 */
export interface ApiEnvironment {
  id: number;
  name: string;
  isActive: boolean;
}

/** 变量（api_variables 一行）。envId=null 表示全局变量。 */
export interface ApiVariable {
  id: number;
  envId: number | null; // null = 全局
  key: string;
  value: string;
  enabled: boolean;
}
