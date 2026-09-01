"use client";

import { ReactNode, useState } from "react";

/**
 * 文本工具的共享 UI 组件。
 *
 * 为何不复用 components/sql-kit 或 components/convert 的同类组件：
 * 各工具应能各自独立演进，跨工具共享会让一处改动波及其他工具，
 * 违背 tool-shell 规格中「新增工具不影响既有工具」的约束。
 * 这里有意接受少量重复——与 sql-kit/shared.tsx 是同一取舍。
 */

/** 面板统一外框：标题 + 说明 + 内容。 */
export function PanelFrame({
  title,
  desc,
  children,
}: {
  title: string;
  desc?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="tk-frame">
      <div className="tk-frame-head">
        <h2 className="tk-frame-title">{title}</h2>
        {desc && <p className="tk-frame-desc">{desc}</p>}
      </div>
      {children}
    </div>
  );
}

/** 多行文本字段；readOnly 即作为输出区。 */
export function TextField({
  label,
  value,
  onChange,
  placeholder,
  readOnly = false,
  actions,
  minHeight,
}: {
  label: string;
  value: string;
  onChange?: (v: string) => void;
  placeholder?: string;
  readOnly?: boolean;
  actions?: ReactNode;
  minHeight?: string;
}) {
  return (
    <div className="tk-field">
      <div className="tk-labelrow">
        <span className="tk-label">{label}</span>
        {actions}
      </div>
      <textarea
        className="tk-textarea"
        value={value}
        placeholder={placeholder}
        readOnly={readOnly}
        style={minHeight ? { minHeight } : undefined}
        onChange={(e) => onChange?.(e.target.value)}
      />
    </div>
  );
}

/** 单行输入字段（前缀、分隔符等）。 */
export function InlineInput({
  label,
  value,
  onChange,
  placeholder,
  width = 160,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  width?: number;
}) {
  return (
    <label className="tk-inline-field">
      <span>{label}</span>
      <input
        className="tk-input tk-mono"
        style={{ width }}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

/** 通用下拉。 */
export function Select<T extends string>({
  label,
  value,
  onChange,
  options,
  width = 140,
}: {
  label?: string;
  value: T;
  onChange: (v: T) => void;
  options: readonly { value: T; label: string }[];
  width?: number;
}) {
  return (
    <label className="tk-inline-field">
      {label && <span>{label}</span>}
      <select
        className="tk-input"
        style={{ width }}
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/** 复选项。 */
export function Checkbox({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="tk-check">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

/** 复制按钮：写入剪贴板并短暂显示「已复制」。 */
export function CopyButton({ text, label = "复制" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const handle = async () => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // 剪贴板不可用时静默忽略
    }
  };
  return (
    <button className="tk-copy" onClick={handle} disabled={!text}>
      {copied ? "已复制" : label}
    </button>
  );
}

/** 红色错误条：error 为空时不渲染。 */
export function ErrorBar({ error }: { error?: string | null }) {
  if (!error) return null;
  return <div className="tk-error">{error}</div>;
}

/** 黄色提示条，用于「结果由推断得出，需人工核对」这类边界说明。 */
export function NoticeBar({ children }: { children: ReactNode }) {
  return <div className="tk-notice">{children}</div>;
}

/** 灰色指引条，用于指向其他工具的交叉指引。 */
export function HintBar({ children }: { children: ReactNode }) {
  return <div className="tk-hint">{children}</div>;
}

/** 主操作按钮。 */
export function PrimaryButton({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button className="tk-btn-primary" onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}
