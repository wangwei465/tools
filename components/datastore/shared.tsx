"use client";

import type { ReactNode } from "react";
import type { DatastoreConnection } from "@/lib/datastore/types";
import { ENV_META } from "@/components/datastore/ConnectionBar";

/**
 * 数据源工具的共享 UI 碎片：错误条、空状态、分页控件、危险操作确认弹窗。
 * ES 与 Mongo 两侧的目录与查询台共用（DRY），CSS 类前缀统一 `ds-`。
 */

/** 错误条：目标不可达 / 查询报错等可读提示，页面不崩溃。 */
export function ErrorBar({ message, onRetry }: { message: string; onRetry?: () => void }) {
  if (!message) return null;
  return (
    <div className="ds-error">
      <span className="ds-error-text">{message}</span>
      {onRetry && (
        <button className="ds-btn-ghost-sm" onClick={onRetry}>
          重试
        </button>
      )}
    </div>
  );
}

/** 空状态：区别于错误，表示「查到了，但没有内容」。 */
export function EmptyState({ text }: { text: string }) {
  return <div className="ds-empty-state">{text}</div>;
}

/** 提示条：采样说明、性能警告等中性信息。 */
export function HintBar({ children }: { children: ReactNode }) {
  return <div className="ds-hintbar">{children}</div>;
}

/** 名称过滤输入框：索引 / 集合列表共用。 */
export function FilterInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <input
      className="ds-filter-input"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      spellCheck={false}
    />
  );
}

interface PagerProps {
  page: number; // 从 0 开始
  pageSize: number;
  /** 已知总数时用于禁用「下一页」；未知（如 Mongo）传 undefined。 */
  total?: number;
  /** 本页实际返回条数，用于在总数未知时判断是否还有下一页。 */
  count: number;
  disabled?: boolean;
  onPage: (page: number) => void;
  onPageSize: (size: number) => void;
}

const PAGE_SIZES = [10, 20, 50, 100];

/** 分页控件：偏移量翻页 + 每页条数。 */
export function Pager({
  page,
  pageSize,
  total,
  count,
  disabled,
  onPage,
  onPageSize,
}: PagerProps) {
  // 总数已知时按总数判断；未知时以「本页是否满页」推断还有没有下一页
  const hasNext = total != null ? (page + 1) * pageSize < total : count >= pageSize;

  return (
    <div className="ds-pager">
      <button
        className="ds-btn-ghost-sm"
        disabled={disabled || page === 0}
        onClick={() => onPage(page - 1)}
      >
        上一页
      </button>
      <span className="ds-pager-info">
        第 {page + 1} 页
        {total != null && <> / 共 {Math.max(1, Math.ceil(total / pageSize))} 页</>}
      </span>
      <button className="ds-btn-ghost-sm" disabled={disabled || !hasNext} onClick={() => onPage(page + 1)}>
        下一页
      </button>
      <select
        className="ds-pager-size"
        value={pageSize}
        onChange={(e) => onPageSize(Number(e.target.value))}
        title="每页条数"
      >
        {PAGE_SIZES.map((s) => (
          <option key={s} value={s}>
            {s} 条/页
          </option>
        ))}
      </select>
    </div>
  );
}

interface ConfirmDialogProps {
  conn: DatastoreConnection;
  /** 服务端返回的危险操作提示。 */
  message: string;
  /** 将要执行的完整操作内容，弹窗内原样回显供核对。 */
  operation: string;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * 危险操作二次确认弹窗。
 * 回显目标连接、环境标签与将要执行的完整操作串——生产误操作的最后一道兜底。
 */
export function ConfirmDialog({
  conn,
  message,
  operation,
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <div className="ds-modal-mask" onClick={onCancel}>
      <div className="ds-modal ds-confirm" onClick={(e) => e.stopPropagation()}>
        <div className="ds-modal-header">
          <span className="ds-modal-title">⚠ 危险操作确认</span>
        </div>
        <div className="ds-confirm-body">
          <pre className="ds-confirm-op">{operation}</pre>
          <p>
            目标连接：<b>{conn.name}</b>
            <span className={`ds-badge ${ENV_META[conn.env].cls}`}>{ENV_META[conn.env].label}</span>
          </p>
          <p className="ds-confirm-warn">{message}</p>
        </div>
        <div className="ds-confirm-actions">
          <button className="ds-btn-ghost" onClick={onCancel}>
            取消
          </button>
          <button className="ds-btn-danger" onClick={onConfirm}>
            确认执行
          </button>
        </div>
      </div>
    </div>
  );
}
