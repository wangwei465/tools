import type { ApiNode, HistoryEntry, NodeType, RequestDraft, ApiEnvironment, ApiVariable } from "./types";
import type { ImportPayload } from "@/lib/api-client/openapi";

/**
 * 集合 / 历史后端 API 的前端封装（薄封装，统一 JSON 收发）。
 * 变更后由调用方重新 fetchNodes/fetchHistory 拉全量，派发 SET_TREE/SET_HISTORY。
 */

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  return (await res.json()) as T;
}

const postInit = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
const patchInit = (body: unknown): RequestInit => ({
  method: "PATCH",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

/* ─── 集合节点 ─── */

export async function fetchNodes(): Promise<ApiNode[]> {
  const d = await jsonFetch<{ ok: boolean; nodes: ApiNode[] }>("/api/collections");
  return d.nodes ?? [];
}

export async function createNodeApi(input: {
  parentId: number | null;
  type: NodeType;
  name: string;
  definition?: RequestDraft | null;
}): Promise<ApiNode | null> {
  const d = await jsonFetch<{ ok: boolean; node?: ApiNode }>(
    "/api/collections",
    postInit(input)
  );
  return d.node ?? null;
}

export async function renameNodeApi(id: number, name: string): Promise<void> {
  await jsonFetch(`/api/collections/${id}`, patchInit({ name }));
}

export async function saveNodeDefinitionApi(id: number, definition: RequestDraft): Promise<void> {
  await jsonFetch(`/api/collections/${id}`, patchInit({ definition }));
}

export async function moveNodeApi(
  id: number,
  parentId: number | null,
  sortOrder: number
): Promise<void> {
  await jsonFetch(`/api/collections/${id}`, patchInit({ move: { parentId, sortOrder } }));
}

export async function deleteNodeApi(id: number): Promise<void> {
  await jsonFetch(`/api/collections/${id}`, { method: "DELETE" });
}

/* ─── OpenAPI 批量导入 ─── */

export interface ImportResult {
  rootId: number;
  rootName: string;
  rootIsCopy: boolean;
  folders: number;
  requests: number;
  environments: Array<{ id: number; name: string; renamedFrom: string | null }>;
}

/** 批量导入：服务端单事务写入，失败整体回滚（此处只透传结果与原因）。 */
export async function importCollectionApi(
  payload: ImportPayload
): Promise<{ ok: true; result: ImportResult } | { ok: false; error: string }> {
  try {
    const d = await jsonFetch<{ ok: boolean; result?: ImportResult; error?: string }>(
      "/api/collections/import",
      postInit(payload)
    );
    if (d.ok && d.result) return { ok: true, result: d.result };
    return { ok: false, error: d.error ?? "导入失败" };
  } catch {
    return { ok: false, error: "导入失败：无法连接后端" };
  }
}

/* ─── 请求历史 ─── */

export async function fetchHistory(): Promise<HistoryEntry[]> {
  const d = await jsonFetch<{ ok: boolean; history: HistoryEntry[] }>("/api/history");
  return d.history ?? [];
}

export async function appendHistoryApi(input: {
  nodeId: number | null;
  snapshot: RequestDraft;
  status: number;
  timeMs: number;
  size: number;
}): Promise<HistoryEntry | null> {
  const d = await jsonFetch<{ ok: boolean; entry?: HistoryEntry }>(
    "/api/history",
    postInit(input)
  );
  return d.entry ?? null;
}

export async function deleteHistoryApi(id: number): Promise<void> {
  await jsonFetch(`/api/history/${id}`, { method: "DELETE" });
}

export async function clearHistoryApi(): Promise<void> {
  await jsonFetch("/api/history", { method: "DELETE" });
}

/* ─── 环境 ─── */

export async function fetchEnvironments(): Promise<ApiEnvironment[]> {
  const d = await jsonFetch<{ ok: boolean; environments: ApiEnvironment[] }>("/api/environments");
  return d.environments ?? [];
}

export async function createEnvironmentApi(name: string): Promise<ApiEnvironment | null> {
  const d = await jsonFetch<{ ok: boolean; environment?: ApiEnvironment }>(
    "/api/environments",
    postInit({ name })
  );
  return d.environment ?? null;
}

export async function renameEnvironmentApi(id: number, name: string): Promise<void> {
  await jsonFetch(`/api/environments/${id}`, patchInit({ name }));
}

export async function deleteEnvironmentApi(id: number): Promise<void> {
  await jsonFetch(`/api/environments/${id}`, { method: "DELETE" });
}

export async function setActiveEnvironmentApi(activeId: number | null): Promise<void> {
  await jsonFetch("/api/environments", patchInit({ activeId }));
}

/* ─── 变量 ─── */

export async function fetchVariables(): Promise<ApiVariable[]> {
  const d = await jsonFetch<{ ok: boolean; variables: ApiVariable[] }>("/api/variables");
  return d.variables ?? [];
}

export async function createVariableApi(input: {
  envId: number | null;
  key: string;
  value: string;
  enabled?: boolean;
}): Promise<ApiVariable | null> {
  const d = await jsonFetch<{ ok: boolean; variable?: ApiVariable }>(
    "/api/variables",
    postInit(input)
  );
  return d.variable ?? null;
}

export async function updateVariableApi(
  id: number,
  patch: { key?: string; value?: string; enabled?: boolean }
): Promise<void> {
  await jsonFetch(`/api/variables/${id}`, patchInit(patch));
}

export async function deleteVariableApi(id: number): Promise<void> {
  await jsonFetch(`/api/variables/${id}`, { method: "DELETE" });
}
