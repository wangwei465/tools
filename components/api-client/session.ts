import type { AppState, Tab, RequestDraft } from "./types";
import { emptyRequest } from "./types";

/**
 * tab 会话的 localStorage 持久化（api-tab-persistence ②）。
 * 只存草稿 / 激活项 / seq；**不存响应**（重放需重发）、**不存 form-data 文件**（沿用①内存态）。
 */

const KEY = "apic.session.v1";

interface PersistedTab {
  id: string;
  nodeId: number | null;
  request: RequestDraft;
  baseline: RequestDraft;
  dirty: boolean;
}
interface PersistedSession {
  tabs: PersistedTab[];
  activeTabId: string;
  seq: number;
}

/** 剥离 form-data 文件的 base64（文件不持久化）。 */
function stripFiles(req: RequestDraft): RequestDraft {
  return {
    ...req,
    body: {
      ...req.body,
      formData: req.body.formData.map((f) =>
        f.kind === "file" ? { ...f, fileBase64: undefined } : f
      ),
    },
  };
}

/** 持久化会话。localStorage 不可用 / 超限时静默忽略（持久化为增强项）。 */
export function saveSession(state: AppState): void {
  try {
    const payload: PersistedSession = {
      tabs: state.tabs.map((t) => ({
        id: t.id,
        nodeId: t.nodeId,
        request: stripFiles(t.request),
        baseline: t.baseline,
        dirty: t.dirty,
      })),
      activeTabId: state.activeTabId,
      seq: state.seq,
    };
    localStorage.setItem(KEY, JSON.stringify(payload));
  } catch {
    /* 忽略 */
  }
}

/** 读取会话；无 / 损坏返回 null。恢复的 tab 响应为空、文件需重选。 */
export function loadSession(): { tabs: Tab[]; activeTabId: string; seq: number } | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as PersistedSession;
    if (!p.tabs?.length) return null;

    const tabs: Tab[] = p.tabs.map((t) => ({
      id: t.id,
      nodeId: t.nodeId ?? null,
      request: normalizeRequest(t.request),
      baseline: normalizeRequest(t.baseline),
      response: null, // 不恢复响应
      sending: false,
      dirty: !!t.dirty,
    }));
    const activeTabId = tabs.some((t) => t.id === p.activeTabId) ? p.activeTabId : tabs[0].id;
    const seq = Math.max(Number(p.seq) || tabs.length, tabs.length);
    return { tabs, activeTabId, seq };
  } catch {
    return null;
  }
}

/** 容错：缺字段的请求补默认，避免旧数据导致渲染崩溃。 */
function normalizeRequest(r: Partial<RequestDraft> | undefined): RequestDraft {
  const base = emptyRequest();
  if (!r) return base;
  return {
    method: r.method ?? base.method,
    url: r.url ?? base.url,
    params: r.params ?? base.params,
    headers: r.headers ?? base.headers,
    body: r.body ? { ...base.body, ...r.body } : base.body,
    auth: r.auth ? { ...base.auth, ...r.auth } : base.auth,
  };
}
