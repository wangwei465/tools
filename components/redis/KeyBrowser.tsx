"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { KeyInfo, RedisConnection, RedisKeyType } from "@/lib/redis/types";
import { redisApi } from "@/components/redis/api";
import { buildKeyTree, DEFAULT_SEPARATOR, isBranch, sortedChildren, type TreeNode } from "@/components/redis/keytree";

interface Props {
  conn: RedisConnection;
  db: number;
  refreshToken: number;
  selectedKey: string | null;
  onSelectKey: (key: string) => void;
  onKeyDeleted: (key: string) => void;
}

/** 键的展示视图：平铺列表 / 前缀树形。 */
type ViewMode = "flat" | "tree";

/** 前缀分隔符（本轮固定默认 `:`，预留后续可配置）。 */
const SEP = DEFAULT_SEPARATOR;

/** 类型徽标配色类。 */
const TYPE_CLS: Record<RedisKeyType, string> = {
  string: "kt-string",
  list: "kt-list",
  set: "kt-set",
  zset: "kt-zset",
  hash: "kt-hash",
  stream: "kt-stream",
  none: "kt-none",
};

/** TTL 展示：-1 永久，-2 不存在。 */
function ttlText(ttl: number): string {
  if (ttl === -1) return "永久";
  if (ttl === -2) return "-";
  return `${ttl}s`;
}

/** 单行 base 缩进（px）。 */
const ROW_PAD = 10;
/** 每层树形缩进（px）。 */
const INDENT = 14;

interface KeyRowProps {
  info: KeyInfo;
  label: string; // 展示文本：平铺为完整 key，树形为末段
  active: boolean;
  readonly: boolean;
  confirming: boolean;
  indentPx?: number;
  onSelect: () => void;
  onAskDelete: () => void;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
}

/**
 * 键行：平铺列表与树形叶子共用（DRY）。
 * 承载选中（进值面板）、删除（二次确认 / 只读拦截），行为与视图无关。
 */
function KeyRow({
  info,
  label,
  active,
  readonly,
  confirming,
  indentPx,
  onSelect,
  onAskDelete,
  onConfirmDelete,
  onCancelDelete,
}: KeyRowProps) {
  return (
    <div
      className={`redis-kb-row${active ? " active" : ""}`}
      style={indentPx != null ? { paddingLeft: indentPx } : undefined}
      onClick={onSelect}
    >
      <span className={`redis-kt ${TYPE_CLS[info.type]}`}>{info.type}</span>
      <span className="redis-kb-key" title={info.key}>
        {label}
      </span>
      <span className="redis-kb-ttl">{ttlText(info.ttl)}</span>
      {confirming ? (
        <span className="redis-kb-confirm" onClick={(e) => e.stopPropagation()}>
          <button className="redis-btn-danger-sm" onClick={onConfirmDelete}>
            删
          </button>
          <button className="redis-btn-ghost-sm" onClick={onCancelDelete}>
            取消
          </button>
        </span>
      ) : (
        <button
          className="redis-kb-del"
          title={readonly ? "只读模式禁止删除" : "删除"}
          disabled={readonly}
          onClick={(e) => {
            e.stopPropagation();
            onAskDelete();
          }}
        >
          🗑
        </button>
      )}
    </div>
  );
}

/**
 * 键浏览器：SCAN 游标分页（前端持有 cursor）+ MATCH 匹配 + 加载更多。
 * 支持「平铺 / 树形」视图切换：两视图共享同一份已加载 keys，树形按分隔符 `:` 组织前缀层级。
 * 每个键展示 类型 + TTL；删除二次确认、只读拦截。
 */
export function KeyBrowser({ conn, db, refreshToken, selectedKey, onSelectKey, onKeyDeleted }: Props) {
  const [match, setMatch] = useState("*");
  const [keys, setKeys] = useState<KeyInfo[]>([]);
  const [cursor, setCursor] = useState("");
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [delConfirm, setDelConfirm] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("flat");
  // 树形展开的分支路径集合（路径 = 从根到该分支的前缀）
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const readonly = conn.mode === "readonly";
  // 以 ref 持有当前 match，避免加载更多时闭包捕获旧值
  const matchRef = useRef(match);
  matchRef.current = match;

  // 树形视图下按已加载 keys 构建前缀树（平铺时不构建，省开销）
  const tree = useMemo(
    () => (viewMode === "tree" ? buildKeyTree(keys, SEP) : []),
    [keys, viewMode]
  );

  const loadPage = useCallback(
    async (cursorArg: string, reset: boolean) => {
      setLoading(true);
      setError("");
      const r = await redisApi.scanKeys(conn.id, db, matchRef.current, cursorArg);
      if (!r.ok) {
        setError(r.error ?? "扫描失败");
        setLoading(false);
        return;
      }
      const batch = r.keys ?? [];
      setKeys((prev) => (reset ? batch : [...prev, ...batch]));
      setCursor(r.nextCursor ?? "");
      setDone((r.nextCursor ?? "") === "");
      setLoading(false);
    },
    [conn.id, db]
  );

  // 连接切换 / 切库 / 外部刷新令牌变化：重扫首页
  useEffect(() => {
    setKeys([]);
    setCursor("");
    setDone(false);
    setDelConfirm(null);
    setExpanded(new Set());
    void loadPage("", true);
  }, [conn.id, refreshToken, loadPage]);

  const search = () => {
    setKeys([]);
    setCursor("");
    setDone(false);
    setExpanded(new Set());
    void loadPage("", true);
  };

  const doDelete = async (key: string) => {
    const r = await redisApi.writeValue(conn.id, db, { action: "del", key });
    if (!r.ok) {
      setError(r.error ?? "删除失败");
      return;
    }
    setKeys((prev) => prev.filter((k) => k.key !== key));
    setDelConfirm(null);
    onKeyDeleted(key);
  };

  const toggle = (path: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  /** 渲染一个叶子（复用 KeyRow） */
  const renderLeaf = (info: KeyInfo, fullKey: string, depth: number, label: string): ReactNode => (
    <KeyRow
      key={`l:${fullKey}`}
      info={info}
      label={label}
      indentPx={ROW_PAD + depth * INDENT}
      active={selectedKey === fullKey}
      readonly={readonly}
      confirming={delConfirm === fullKey}
      onSelect={() => onSelectKey(fullKey)}
      onAskDelete={() => setDelConfirm(fullKey)}
      onConfirmDelete={() => doDelete(fullKey)}
      onCancelDelete={() => setDelConfirm(null)}
    />
  );

  /** 递归渲染前缀树节点为行数组。 */
  const renderNodes = (nodes: TreeNode[], depth: number, prefix: string): ReactNode[] =>
    nodes.flatMap((node) => {
      const path = prefix ? `${prefix}${SEP}${node.segment}` : node.segment;
      if (!isBranch(node)) {
        // 纯叶子
        return node.keyInfo && node.fullKey
          ? [renderLeaf(node.keyInfo, node.fullKey, depth, node.segment)]
          : [];
      }
      // 分支：可展开/折叠，显示其下 key 计数
      const open = expanded.has(path);
      const rows: ReactNode[] = [
        <div
          key={`b:${path}`}
          className="redis-kb-branch"
          style={{ paddingLeft: ROW_PAD + depth * INDENT }}
          onClick={() => toggle(path)}
          title={path}
        >
          <span className="redis-kb-caret">{open ? "▾" : "▸"}</span>
          <span className="redis-kb-seg">{node.segment}</span>
          <span className="redis-kb-count">{node.count}</span>
        </div>,
      ];
      if (open) {
        // 前缀恰为键的碰撞（如 `user` 与 `user:1`）：把自身键作首个叶子渲染，避免在树中丢失
        if (node.fullKey && node.keyInfo) {
          rows.push(renderLeaf(node.keyInfo, node.fullKey, depth + 1, node.segment));
        }
        rows.push(...renderNodes(sortedChildren(node), depth + 1, path));
      }
      return rows;
    });

  return (
    <div className="redis-keybrowser">
      <div className="redis-kb-search">
        <input
          className="redis-kb-input"
          value={match}
          onChange={(e) => setMatch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && search()}
          placeholder="匹配模式，如 user:*"
        />
        <button className="redis-btn-ghost" onClick={search} disabled={loading}>
          扫描
        </button>
        <div className="redis-kb-seg-toggle">
          <button
            className={`redis-kb-seg-btn${viewMode === "flat" ? " active" : ""}`}
            onClick={() => setViewMode("flat")}
            title="平铺列表"
          >
            平铺
          </button>
          <button
            className={`redis-kb-seg-btn${viewMode === "tree" ? " active" : ""}`}
            onClick={() => setViewMode("tree")}
            title="按前缀树形组织"
          >
            树形
          </button>
        </div>
      </div>

      {error && <div className="redis-kb-error">{error}</div>}

      <div className="redis-kb-list">
        {viewMode === "flat"
          ? keys.map((k) => (
              <KeyRow
                key={k.key}
                info={k}
                label={k.key}
                active={selectedKey === k.key}
                readonly={readonly}
                confirming={delConfirm === k.key}
                onSelect={() => onSelectKey(k.key)}
                onAskDelete={() => setDelConfirm(k.key)}
                onConfirmDelete={() => doDelete(k.key)}
                onCancelDelete={() => setDelConfirm(null)}
              />
            ))
          : renderNodes(tree, 0, "")}

        {keys.length === 0 && !loading && <div className="redis-kb-empty">无匹配的键</div>}
      </div>

      <div className="redis-kb-footer">
        {loading ? (
          <span className="redis-kb-hint">加载中…</span>
        ) : done ? (
          <span className="redis-kb-hint">已加载 {keys.length} 个键（遍历完成）</span>
        ) : (
          <button className="redis-btn-ghost" onClick={() => loadPage(cursor, false)}>
            加载更多
          </button>
        )}
      </div>
    </div>
  );
}
