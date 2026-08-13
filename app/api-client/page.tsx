"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { reducer, initState } from "@/components/api-client/state";
import { assembleRequest } from "@/components/api-client/assemble";
import { emptyRequest } from "@/components/api-client/types";
import type {
  RequestDraft,
  ResponseState,
  ApiNode,
  NodeType,
  WireEnvelope,
} from "@/components/api-client/types";
import { TabBar } from "@/components/api-client/TabBar";
import { RequestPane } from "@/components/api-client/RequestPane";
import { ResponsePane } from "@/components/api-client/ResponsePane";
import { Sidebar } from "@/components/api-client/Sidebar";
import { SaveDialog } from "@/components/api-client/SaveDialog";
import { EnvBar } from "@/components/api-client/EnvBar";
import { EnvManager } from "@/components/api-client/EnvManager";
import { PreviewDialog } from "@/components/api-client/PreviewDialog";
import { ImportDialog } from "@/components/api-client/ImportDialog";
import { CodegenDialog } from "@/components/api-client/CodegenDialog";
import { buildTree, collectSubtreeIds } from "@/components/api-client/tree";
import { resolveVars, substituteDraft } from "@/components/api-client/vars";
import { saveSession, loadSession } from "@/components/api-client/session";
import * as api from "@/components/api-client/api";

/**
 * 接口调试工具主页面（api-environments ③）。
 *
 * 在 ② 持久化工作台上叠加环境与变量：顶部环境切换器 + 变量管理；
 * 发送时以「激活环境 > 全局」解析的变量对请求做 {{var}} 替换（组装管线最前段），
 * 代理不感知变量；支持替换后预览。
 */
export default function ApiClientPage() {
  const [state, dispatch] = useReducer(reducer, null, initState);
  const active = state.tabs.find((t) => t.id === state.activeTabId) ?? state.tabs[0];
  const controllers = useRef<Record<string, AbortController>>({});
  const nodesRef = useRef<ApiNode[]>([]);
  const [saveOpen, setSaveOpen] = useState(false);
  const [envManagerOpen, setEnvManagerOpen] = useState(false);
  const [preview, setPreview] = useState<{ wire: WireEnvelope; missing: string[] } | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [codegenWire, setCodegenWire] = useState<WireEnvelope | null>(null);

  // 生效变量映射（激活环境 > 全局，仅 enabled）
  const resolvedVars = useMemo(
    () => resolveVars(state.variables, state.activeEnvId),
    [state.variables, state.activeEnvId]
  );

  // nodeId → 节点名称映射（tab / 历史显示中文名；扁平遍历集合树）
  const nodeNames = useMemo(() => {
    const m = new Map<number, string>();
    const walk = (nodes: typeof state.tree) => {
      for (const n of nodes) {
        m.set(n.id, n.name);
        if (n.children.length) walk(n.children);
      }
    };
    walk(state.tree);
    return m;
  }, [state.tree]);

  /* ─── 数据加载 ─── */
  const reloadTree = useCallback(async () => {
    const nodes = await api.fetchNodes();
    nodesRef.current = nodes;
    dispatch({ type: "SET_TREE", tree: buildTree(nodes) });
  }, []);
  const reloadHistory = useCallback(async () => {
    dispatch({ type: "SET_HISTORY", history: await api.fetchHistory() });
  }, []);
  const reloadEnvVars = useCallback(async () => {
    const [envs, vars] = await Promise.all([api.fetchEnvironments(), api.fetchVariables()]);
    dispatch({ type: "SET_ENVIRONMENTS", environments: envs });
    dispatch({ type: "SET_VARIABLES", variables: vars });
  }, []);

  // 挂载：恢复会话 + 拉取集合树 / 历史 / 环境变量
  useEffect(() => {
    const s = loadSession();
    if (s) dispatch({ type: "RESTORE_SESSION", tabs: s.tabs, activeTabId: s.activeTabId, seq: s.seq });
    reloadTree();
    reloadHistory();
    reloadEnvVars();
  }, [reloadTree, reloadHistory, reloadEnvVars]);

  // 会话防抖持久化
  useEffect(() => {
    const timer = setTimeout(() => saveSession(state), 400);
    return () => clearTimeout(timer);
  }, [state.tabs, state.activeTabId, state.seq]);

  /* ─── 请求编辑 / 发送 ─── */
  const patch = useCallback(
    (p: Partial<RequestDraft>) =>
      dispatch({ type: "PATCH_REQUEST", tabId: state.activeTabId, patch: p }),
    [state.activeTabId]
  );

  const send = useCallback(async () => {
    const tab = state.tabs.find((t) => t.id === state.activeTabId);
    if (!tab) return;
    const tabId = tab.id;
    const draft = tab.request;
    if (!draft.url.trim()) {
      dispatch({ type: "SET_RESPONSE", tabId, response: errorResp("请先填写请求地址") });
      return;
    }

    const controller = new AbortController();
    controllers.current[tabId] = controller;
    dispatch({ type: "SET_SENDING", tabId, sending: true });

    try {
      // 变量替换在组装管线最前段完成，代理只收到替换后的 wire
      const env = assembleRequest(draft, resolvedVars);
      const res = await fetch("/api/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(env),
        signal: controller.signal,
      });
      const data = await res.json();
      const resp: ResponseState = data.ok
        ? {
            status: data.status,
            statusText: data.statusText,
            headers: data.headers ?? {},
            body: data.body ?? "",
            timeMs: data.timeMs ?? 0,
            size: data.size ?? 0,
            contentType: data.contentType ?? "",
          }
        : errorResp(data.error ?? "请求失败");
      dispatch({ type: "SET_RESPONSE", tabId, response: resp });
      // 落历史（快照 = 原始请求定义，保留 {{var}}）
      await api.appendHistoryApi({
        nodeId: tab.nodeId,
        snapshot: draft,
        status: resp.error ? 0 : resp.status,
        timeMs: resp.timeMs,
        size: resp.size,
      });
      reloadHistory();
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        dispatch({ type: "SET_SENDING", tabId, sending: false });
      } else {
        dispatch({ type: "SET_RESPONSE", tabId, response: errorResp("请求失败，请检查网络或地址") });
        await api.appendHistoryApi({ nodeId: tab.nodeId, snapshot: draft, status: 0, timeMs: 0, size: 0 });
        reloadHistory();
      }
    } finally {
      delete controllers.current[tabId];
    }
  }, [state.tabs, state.activeTabId, resolvedVars, reloadHistory]);

  const cancel = useCallback(() => {
    controllers.current[state.activeTabId]?.abort();
  }, [state.activeTabId]);

  const onPreview = () => {
    const { missing } = substituteDraft(active.request, resolvedVars);
    const wire = assembleRequest(active.request, resolvedVars);
    setPreview({ wire, missing });
  };

  // 导入：解析结果载入新 tab（复用 REPLAY——新 tab、未关联节点，不覆盖当前编辑）
  const onImport = (draft: RequestDraft) => dispatch({ type: "REPLAY", snapshot: draft });

  // 生成代码：以 ① 组装后的 wire 为输入（③ 在场则为替换后值），保证「所见即所发」
  const onCodegen = () => setCodegenWire(assembleRequest(active.request, resolvedVars));

  /* ─── 集合树 CRUD / 移动 ─── */
  const onCreate = async (parentId: number | null, type: NodeType) => {
    await api.createNodeApi({
      parentId,
      type,
      name: type === "folder" ? "新建文件夹" : "未命名请求",
      definition: type === "request" ? emptyRequest() : null,
    });
    reloadTree();
  };
  const onRename = async (id: number, name: string) => {
    await api.renameNodeApi(id, name);
    reloadTree();
  };
  const onDelete = async (node: ApiNode) => {
    const msg =
      node.type === "folder"
        ? `删除文件夹「${node.name}」及其全部子节点？`
        : `删除请求「${node.name}」？`;
    if (!window.confirm(msg)) return;
    const affected = collectSubtreeIds(nodesRef.current, node.id);
    await api.deleteNodeApi(node.id);
    dispatch({ type: "DETACH_NODES", nodeIds: affected });
    reloadTree();
  };
  const onMove = async (dragId: number, targetId: number | null, asChild: boolean) => {
    const nodes = nodesRef.current;
    const sub = new Set(collectSubtreeIds(nodes, dragId));
    if (targetId != null && sub.has(targetId)) return;

    const siblingsOf = (pid: number | null) =>
      nodes
        .filter((n) => n.parentId === pid && n.id !== dragId)
        .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
        .map((n) => n.id);

    let parentId: number | null;
    let order: number[];
    let insertAt: number;
    if (asChild) {
      parentId = targetId;
      order = siblingsOf(parentId);
      insertAt = order.length;
    } else {
      const target = nodes.find((n) => n.id === targetId);
      if (!target) return;
      parentId = target.parentId;
      order = siblingsOf(parentId);
      insertAt = order.indexOf(targetId!);
      if (insertAt < 0) insertAt = order.length;
    }
    order.splice(insertAt, 0, dragId);
    await Promise.all(order.map((id, i) => api.moveNodeApi(id, parentId, i)));
    reloadTree();
  };

  /* ─── 保存 / 打开 ─── */
  const onSave = () => {
    const { id, nodeId, request } = active;
    if (nodeId != null) {
      api.saveNodeDefinitionApi(nodeId, request).then(() => {
        dispatch({ type: "SAVE_TAB", tabId: id, nodeId, definition: request });
        reloadTree();
      });
    } else {
      setSaveOpen(true);
    }
  };
  const onSaveAs = () => setSaveOpen(true);
  const onSaveConfirm = async (parentId: number | null, name: string) => {
    const { id, request } = active;
    const node = await api.createNodeApi({ parentId, type: "request", name, definition: request });
    setSaveOpen(false);
    if (node) {
      dispatch({ type: "SAVE_TAB", tabId: id, nodeId: node.id, definition: request });
      reloadTree();
    }
  };

  /* ─── 历史 ─── */
  const onDeleteHistory = async (hid: number) => {
    await api.deleteHistoryApi(hid);
    reloadHistory();
  };
  const onClearHistory = async () => {
    if (window.confirm("确认清空全部历史？")) {
      await api.clearHistoryApi();
      reloadHistory();
    }
  };

  /* ─── 环境 / 变量 ─── */
  const onActivateEnv = async (id: number | null) => {
    await api.setActiveEnvironmentApi(id);
    reloadEnvVars();
  };
  const onCreateEnv = async (name: string) => {
    await api.createEnvironmentApi(name);
    reloadEnvVars();
  };
  const onRenameEnv = async (id: number, name: string) => {
    await api.renameEnvironmentApi(id, name);
    reloadEnvVars();
  };
  const onDeleteEnv = async (id: number) => {
    await api.deleteEnvironmentApi(id);
    reloadEnvVars();
  };
  const onCreateVar = async (envId: number | null, key: string, value: string) => {
    await api.createVariableApi({ envId, key, value });
    reloadEnvVars();
  };
  const onUpdateVar = async (
    id: number,
    p: { key?: string; value?: string; enabled?: boolean }
  ) => {
    await api.updateVariableApi(id, p);
    reloadEnvVars();
  };
  const onDeleteVar = async (id: number) => {
    await api.deleteVariableApi(id);
    reloadEnvVars();
  };

  return (
    <div className="apic-page">
      <div className="apic-header">
        <h1 className="apic-title">接口调试</h1>
        <span className="apic-subtitle">Apifox 式接口请求工具</span>
        <div className="apic-header-spacer" />
        <EnvBar
          environments={state.environments}
          activeEnvId={state.activeEnvId}
          onActivate={onActivateEnv}
          onOpenManager={() => setEnvManagerOpen(true)}
        />
      </div>

      <div className="apic-shell">
        <Sidebar
          tree={state.tree}
          history={state.history}
          activeNodeId={active.nodeId}
          nodeNames={nodeNames}
          onOpen={(node) => dispatch({ type: "OPEN_NODE", node })}
          onCreate={onCreate}
          onRename={onRename}
          onDelete={onDelete}
          onMove={onMove}
          onReplay={(snapshot) => dispatch({ type: "REPLAY", snapshot })}
          onDeleteHistory={onDeleteHistory}
          onClearHistory={onClearHistory}
        />

        <div className="apic-main">
          <TabBar
            tabs={state.tabs}
            activeTabId={state.activeTabId}
            nodeNames={nodeNames}
            onActivate={(id) => dispatch({ type: "ACTIVATE_TAB", tabId: id })}
            onClose={(id) => dispatch({ type: "CLOSE_TAB", tabId: id })}
            onNew={() => dispatch({ type: "NEW_TAB" })}
          />

          <div className="apic-workbench">
            <div className="apic-savebar">
              <button className="apic-btn-ghost" onClick={onSave} title="保存到集合">
                {active.dirty ? "保存 ●" : "保存"}
              </button>
              <button className="apic-btn-ghost" onClick={onSaveAs} title="另存为新接口">
                另存为
              </button>
              <button className="apic-btn-ghost" onClick={onPreview} title="预览变量替换后的实际请求">
                预览
              </button>
              <button className="apic-btn-ghost" onClick={() => setImportOpen(true)} title="粘贴 cURL 导入为新标签页">
                导入 cURL
              </button>
              <button className="apic-btn-ghost" onClick={onCodegen} title="生成 curl / fetch 代码">
                生成代码
              </button>
              {active.nodeId != null && <span className="apic-saved-hint">已关联集合</span>}
            </div>

            <RequestPane
              request={active.request}
              sending={active.sending}
              onPatch={patch}
              onSend={send}
              onCancel={cancel}
            />
            <ResponsePane response={active.response} sending={active.sending} />
          </div>
        </div>
      </div>

      {saveOpen && (
        <SaveDialog
          tree={state.tree}
          defaultName={deriveName(active.request)}
          onConfirm={onSaveConfirm}
          onCancel={() => setSaveOpen(false)}
        />
      )}
      {envManagerOpen && (
        <EnvManager
          environments={state.environments}
          variables={state.variables}
          onClose={() => setEnvManagerOpen(false)}
          onCreateEnv={onCreateEnv}
          onRenameEnv={onRenameEnv}
          onDeleteEnv={onDeleteEnv}
          onCreateVar={onCreateVar}
          onUpdateVar={onUpdateVar}
          onDeleteVar={onDeleteVar}
        />
      )}
      {preview && (
        <PreviewDialog wire={preview.wire} missing={preview.missing} onClose={() => setPreview(null)} />
      )}
      {importOpen && (
        <ImportDialog onImport={onImport} onClose={() => setImportOpen(false)} />
      )}
      {codegenWire && (
        <CodegenDialog wire={codegenWire} onClose={() => setCodegenWire(null)} />
      )}
    </div>
  );
}

/** 构造代理层错误的响应占位（网络/超时/参数错误）。 */
function errorResp(error: string): ResponseState {
  return {
    status: 0,
    statusText: "",
    headers: {},
    body: "",
    timeMs: 0,
    size: 0,
    contentType: "",
    error,
  };
}

/** 从请求 URL 推导默认保存名（末段 path）。 */
function deriveName(req: RequestDraft): string {
  const u = req.url.trim();
  if (!u) return "未命名请求";
  const path = u.replace(/^https?:\/\//, "").split("?")[0];
  const seg = path.split("/").filter(Boolean).pop();
  return seg || path || "未命名请求";
}
