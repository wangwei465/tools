import type {
  AppState,
  Tab,
  RequestDraft,
  ResponseState,
  TreeNode,
  HistoryEntry,
  ApiNode,
  ApiEnvironment,
  ApiVariable,
} from "./types";
import { emptyRequest } from "./types";

/**
 * 工作台状态机（useReducer）。
 * 针对具体 tab 的 action 以 tabId 寻址；集合树 / 历史整体替换（SET_TREE/SET_HISTORY，
 * 由 page 在 API 变更后重新拉取派发）。dirty 相对 tab.baseline（关联节点定义或初始态）判定。
 */

export type Action =
  | { type: "NEW_TAB" }
  | { type: "CLOSE_TAB"; tabId: string }
  | { type: "ACTIVATE_TAB"; tabId: string }
  | { type: "PATCH_REQUEST"; tabId: string; patch: Partial<RequestDraft> }
  | { type: "SET_SENDING"; tabId: string; sending: boolean }
  | { type: "SET_RESPONSE"; tabId: string; response: ResponseState | null }
  | { type: "SET_TREE"; tree: TreeNode[] }
  | { type: "SET_HISTORY"; history: HistoryEntry[] }
  | { type: "OPEN_NODE"; node: ApiNode }
  | { type: "SAVE_TAB"; tabId: string; nodeId: number; definition: RequestDraft }
  | { type: "REPLAY"; snapshot: RequestDraft }
  | { type: "DETACH_NODES"; nodeIds: number[] }
  | { type: "RESTORE_SESSION"; tabs: Tab[]; activeTabId: string; seq: number }
  | { type: "SET_ENVIRONMENTS"; environments: ApiEnvironment[] }
  | { type: "SET_VARIABLES"; variables: ApiVariable[] };

/** dirty 判定：请求相对基线是否变化（结构同源，键序稳定，stringify 比较可靠）。 */
function isDirty(a: RequestDraft, b: RequestDraft): boolean {
  return JSON.stringify(a) !== JSON.stringify(b);
}

function createTab(id: string): Tab {
  return {
    id,
    nodeId: null,
    request: emptyRequest(),
    baseline: emptyRequest(),
    response: null,
    sending: false,
    dirty: false,
  };
}

export function initState(): AppState {
  return {
    tabs: [createTab("tab-0")],
    activeTabId: "tab-0",
    seq: 1,
    tree: [],
    history: [],
    environments: [],
    variables: [],
    activeEnvId: null,
  };
}

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "NEW_TAB": {
      const id = `tab-${state.seq}`;
      return {
        ...state,
        tabs: [...state.tabs, createTab(id)],
        activeTabId: id,
        seq: state.seq + 1,
      };
    }

    case "CLOSE_TAB": {
      const idx = state.tabs.findIndex((t) => t.id === action.tabId);
      if (idx < 0) return state;
      const tabs = state.tabs.filter((t) => t.id !== action.tabId);

      // 始终保留至少一个 tab
      if (tabs.length === 0) {
        const id = `tab-${state.seq}`;
        return { ...state, tabs: [createTab(id)], activeTabId: id, seq: state.seq + 1 };
      }

      // 关闭的是激活 tab 时，切换到相邻 tab
      let activeTabId = state.activeTabId;
      if (action.tabId === state.activeTabId) {
        activeTabId = tabs[Math.min(idx, tabs.length - 1)].id;
      }
      return { ...state, tabs, activeTabId };
    }

    case "ACTIVATE_TAB":
      return { ...state, activeTabId: action.tabId };

    case "PATCH_REQUEST":
      return {
        ...state,
        tabs: state.tabs.map((t) => {
          if (t.id !== action.tabId) return t;
          const request = { ...t.request, ...action.patch };
          return { ...t, request, dirty: isDirty(request, t.baseline) };
        }),
      };

    case "SET_SENDING":
      return {
        ...state,
        tabs: state.tabs.map((t) =>
          t.id === action.tabId ? { ...t, sending: action.sending } : t
        ),
      };

    case "SET_RESPONSE":
      return {
        ...state,
        tabs: state.tabs.map((t) =>
          t.id === action.tabId ? { ...t, response: action.response, sending: false } : t
        ),
      };

    case "SET_TREE":
      return { ...state, tree: action.tree };

    case "SET_HISTORY":
      return { ...state, history: action.history };

    case "SET_ENVIRONMENTS":
      return {
        ...state,
        environments: action.environments,
        activeEnvId: action.environments.find((e) => e.isActive)?.id ?? null,
      };

    case "SET_VARIABLES":
      return { ...state, variables: action.variables };

    case "OPEN_NODE": {
      const { node } = action;
      if (node.type !== "request" || !node.definition) return state;
      // 已有关联该节点的 tab → 直接激活，不重复打开
      const existing = state.tabs.find((t) => t.nodeId === node.id);
      if (existing) return { ...state, activeTabId: existing.id };
      const id = `tab-${state.seq}`;
      const tab: Tab = {
        id,
        nodeId: node.id,
        request: node.definition,
        baseline: node.definition,
        response: null,
        sending: false,
        dirty: false,
      };
      return { ...state, tabs: [...state.tabs, tab], activeTabId: id, seq: state.seq + 1 };
    }

    case "SAVE_TAB":
      // 保存后：关联节点 + 刷新基线 + 清 dirty
      return {
        ...state,
        tabs: state.tabs.map((t) =>
          t.id === action.tabId
            ? { ...t, nodeId: action.nodeId, baseline: action.definition, dirty: false }
            : t
        ),
      };

    case "REPLAY": {
      const id = `tab-${state.seq}`;
      const tab: Tab = {
        id,
        nodeId: null,
        request: action.snapshot,
        baseline: emptyRequest(),
        response: null,
        sending: false,
        dirty: isDirty(action.snapshot, emptyRequest()),
      };
      return { ...state, tabs: [...state.tabs, tab], activeTabId: id, seq: state.seq + 1 };
    }

    case "DETACH_NODES": {
      const set = new Set(action.nodeIds);
      return {
        ...state,
        tabs: state.tabs.map((t) =>
          t.nodeId != null && set.has(t.nodeId) ? { ...t, nodeId: null, dirty: true } : t
        ),
      };
    }

    case "RESTORE_SESSION":
      return {
        ...state,
        tabs: action.tabs,
        activeTabId: action.activeTabId,
        seq: action.seq,
      };

    default:
      return state;
  }
}
