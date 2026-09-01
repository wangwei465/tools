import type { AuthState, KV, RequestDraft } from "@/components/api-client/types";
import { emptyRequest } from "@/components/api-client/types";
import { paramsToUrl } from "@/components/api-client/assemble";
import { BASE_URL_VAR, uniqueName } from "./types";
import type { ApiAuth, ApiDocModel, ApiOperation, ImportIssue } from "./types";

// 命名工具定义在 types.ts（无依赖），此处再导出以维持解析层的对外接口
export { BASE_URL_VAR, uniqueName };

/**
 * 归一化模型 → 集合树 + 环境 + 变量（api-openapi-import ④b）。
 *
 * 产出的树固定两层：根文件夹（`info.title`）→ 分组文件夹 → 请求节点，
 * 与 OpenAPI 的实际结构一致，无需通用递归树。
 * 请求 URL 一律以 `{{baseUrl}}` 为前缀接上既有的环境切换与变量替换；
 * 路径参数 `{id}` 保留原样——`vars.ts` 的替换要求双花括号，单花括号不会被误匹配。
 */

/** 变量替换用的前缀变量名。 */

/** 根文件夹兜底名（`info.title` 缺失时）。 */
const FALLBACK_TITLE = "未命名服务";

/** 分组兜底名（既无 tag 也取不出有意义的 path 段时）。 */
const FALLBACK_GROUP = "未分类";

/** path 首段中无信息量的通用前缀：对每个接口都相同，用它分组等于没分组。 */
const GENERIC_SEGMENTS = new Set(["api", "apis", "rest", "open", "service", "services", "app"]);

/* ─── 计划的数据形状 ─────────────────────────────────────── */

export interface ImportRequestSpec {
  name: string;
  definition: RequestDraft;
}

export interface ImportGroupSpec {
  name: string;
  requests: ImportRequestSpec[];
}

export interface ImportEnvSpec {
  name: string;
  baseUrl: string;
}

export interface ImportPlan {
  /** 根文件夹基名；与既有集合的重名消解在写入前进行。 */
  rootName: string;
  groups: ImportGroupSpec[];
  environments: ImportEnvSpec[];
  issues: ImportIssue[];
  stats: { folders: number; requests: number };
}

/** 写入端点的载荷：计划中需落库的部分（名称为基名，由服务端消解重名）。 */
export type ImportPayload = Pick<ImportPlan, "rootName" | "groups" | "environments">;

/* ─── 命名 ───────────────────────────────────────────────── */

function isGenericSegment(seg: string): boolean {
  return GENERIC_SEGMENTS.has(seg.toLowerCase()) || /^v\d+$/i.test(seg);
}

/** 分组三级回退：第一个 tag → path 首个有信息量的段 → 未分类。 */
export function groupOf(op: ApiOperation): string {
  if (op.group) return op.group;
  for (const seg of op.path.split("/")) {
    if (!seg || seg.startsWith("{") || isGenericSegment(seg)) continue;
    return seg;
  }
  return FALLBACK_GROUP;
}

/** 节点名三级回退：summary → operationId → method + path。 */
export function nodeNameOf(op: ApiOperation): string {
  return op.summary || op.operationId || `${op.method} ${op.path}`;
}

/** 从 URL 取 host，用作缺 description 时的环境名。 */
function hostOf(url: string): string {
  const m = url.match(/^[a-zA-Z][\w+.-]*:\/\/([^/?#]+)/);
  return m ? m[1] : "";
}

/* ─── 请求定义 ───────────────────────────────────────────── */

function toAuthState(auth: ApiAuth): AuthState {
  const base = emptyRequest().auth;
  switch (auth.kind) {
    case "bearer":
      return { ...base, type: "bearer" };
    case "basic":
      return { ...base, type: "basic" };
    case "apikey":
      return { ...base, type: "apikey", apiKeyName: auth.name, apiKeyIn: auth.in };
    default:
      return base;
  }
}

function toDraft(op: ApiOperation): RequestDraft {
  const params: KV[] = op.query.map((p) => ({ key: p.name, value: p.value, enabled: true }));
  const headers: KV[] = op.headers.map((h) => ({ key: h.name, value: h.value, enabled: true }));

  return {
    method: op.method,
    // URL 是发送真相源，query 必须落进 URL；params 是它的结构化视图
    url: paramsToUrl(`{{${BASE_URL_VAR}}}${op.path}`, params),
    params,
    headers,
    body:
      op.bodyRaw === null
        ? { type: "none", raw: "", formData: [], urlencoded: [] }
        : { type: "raw", raw: op.bodyRaw, formData: [], urlencoded: [] },
    auth: toAuthState(op.auth),
  };
}

/* ─── 计划构造 ───────────────────────────────────────────── */

function buildEnvironments(model: ApiDocModel): ImportEnvSpec[] {
  const taken = new Set<string>();
  return model.servers.map((s, i) => {
    const base = s.description || hostOf(s.url) || `环境 ${i + 1}`;
    const name = uniqueName(base, taken);
    taken.add(name);
    return { name, baseUrl: s.url };
  });
}

/**
 * 归一化模型 → 导入计划（纯函数，不接触数据库）。
 * 名称一律为基名，与既有集合 / 环境的重名消解交给 `resolvePlanNames`。
 */
export function buildImportPlan(model: ApiDocModel): ImportPlan {
  const issues: ImportIssue[] = [...model.issues];
  const groupMap = new Map<string, ImportRequestSpec[]>();
  let untagged = 0;
  const pathParamOps: string[] = [];

  for (const op of model.operations) {
    if (!op.group) untagged++;
    if (/\{[^{}]+\}/.test(op.path)) pathParamOps.push(`${op.method} ${op.path}`);

    const group = groupOf(op);
    const list = groupMap.get(group);
    const spec: ImportRequestSpec = { name: nodeNameOf(op), definition: toDraft(op) };
    if (list) list.push(spec);
    else groupMap.set(group, [spec]);
  }

  if (untagged > 0) {
    issues.push({
      type: "missing-tag",
      where: "",
      message: `${untagged} 个接口没有 tag，已按 path 首段分组`,
    });
  }
  if (pathParamOps.length > 0) {
    issues.push({
      type: "path-param",
      where: pathParamOps.slice(0, 3).join("、") + (pathParamOps.length > 3 ? " 等" : ""),
      message: `${pathParamOps.length} 个请求的 URL 含 {} 形式的路径参数，保留原样，发送前需手工替换`,
    });
  }

  const environments = buildEnvironments(model);
  if (environments.length === 0) {
    issues.push({
      type: "no-server",
      where: "",
      message: `文档未定义服务器地址，未创建环境；请求 URL 仍以 {{${BASE_URL_VAR}}} 为前缀，需自行配置该变量`,
    });
  }

  const groups = [...groupMap].map(([name, requests]) => ({ name, requests }));
  return {
    rootName: model.title || FALLBACK_TITLE,
    groups,
    environments,
    issues,
    stats: {
      folders: 1 + groups.length, // 根文件夹 + 分组文件夹
      requests: model.operations.length,
    },
  };
}

/* ─── 重名消解（预览与写入共用同一套规则）───────────────── */

export interface NameResolution {
  rootName: string;
  /** 根文件夹重名，将新建带后缀的副本而非合并。 */
  rootIsCopy: boolean;
  environments: Array<{ name: string; baseUrl: string; renamedFrom: string | null }>;
}

/**
 * 依既有的根文件夹名与环境名消解重名。
 * 既有环境 MUST NOT 被覆盖——重名一律改用带后缀的新名称。
 */
export function resolvePlanNames(
  plan: ImportPlan,
  existing: { rootFolderNames: string[]; envNames: string[] }
): NameResolution {
  const rootName = uniqueName(plan.rootName, existing.rootFolderNames);
  const taken = new Set(existing.envNames);

  const environments = plan.environments.map((e) => {
    const name = uniqueName(e.name, taken);
    taken.add(name);
    return { name, baseUrl: e.baseUrl, renamedFrom: name === e.name ? null : e.name };
  });

  return { rootName, rootIsCopy: rootName !== plan.rootName, environments };
}
