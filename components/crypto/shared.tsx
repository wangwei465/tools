"use client";

import { ReactNode, useState } from "react";

/**
 * 加解密面板的共享 UI 组件。
 *
 * 为何不复用 components/convert/shared.tsx：两个工具应能各自独立演进，
 * 跨工具共享组件会让「编码转换」的一次改动波及本工具，违背
 * tool-shell 规格中"新增工具不影响既有工具"的约束。
 * 这里有意接受少量重复，待第三个工具出现同样需求时再上提。
 */

export type InputEncoding = "utf8" | "hex" | "base64";
export type OutputEncoding = "hex" | "base64";

const ENCODING_LABEL: Record<string, string> = {
  utf8: "UTF-8",
  hex: "Hex",
  base64: "Base64",
};

/** 编码选择下拉。编码一律显式选择，不做自动嗅探。 */
export function EncodingSelect<T extends string>({
  value,
  onChange,
  options,
  title,
}: {
  value: T;
  onChange: (v: T) => void;
  options: readonly T[];
  title?: string;
}) {
  return (
    <select
      className="crypto-select"
      value={value}
      title={title}
      onChange={(e) => onChange(e.target.value as T)}
    >
      {options.map((o) => (
        <option key={o} value={o}>
          {ENCODING_LABEL[o] ?? o}
        </option>
      ))}
    </select>
  );
}

/** 通用下拉，用于算法、模式、密钥位数等枚举选择。 */
export function Select<T extends string | number>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: readonly { value: T; label: string }[];
  label?: string;
}) {
  return (
    <label className="crypto-inline-field">
      {label && <span>{label}</span>}
      <select
        className="crypto-select"
        value={String(value)}
        onChange={(e) => {
          const raw = e.target.value;
          const matched = options.find((o) => String(o.value) === raw)!;
          onChange(matched.value);
        }}
      >
        {options.map((o) => (
          <option key={String(o.value)} value={String(o.value)}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/** 带编码选择的单行输入（密钥、IV、认证标签等）。 */
export function EncodedField({
  label,
  value,
  onChange,
  encoding,
  onEncodingChange,
  encodings,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  encoding: InputEncoding;
  onEncodingChange: (v: InputEncoding) => void;
  encodings: readonly InputEncoding[];
  placeholder?: string;
}) {
  return (
    <div className="crypto-field">
      <div className="crypto-labelrow">
        <span className="crypto-label">{label}</span>
        <EncodingSelect
          value={encoding}
          onChange={onEncodingChange}
          options={encodings}
          title={`${label}的编码`}
        />
      </div>
      <input
        className="crypto-input crypto-mono"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

/** 多行文本域字段。 */
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
    <div className="crypto-field">
      <div className="crypto-labelrow">
        <span className="crypto-label">{label}</span>
        {actions}
      </div>
      <textarea
        className="crypto-textarea"
        value={value}
        placeholder={placeholder}
        readOnly={readOnly}
        style={minHeight ? { minHeight } : undefined}
        onChange={(e) => onChange?.(e.target.value)}
      />
    </div>
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
    <button className="crypto-copy" onClick={handle} disabled={!text}>
      {copied ? "已复制" : label}
    </button>
  );
}

/** 红色错误条：error 为空时不渲染。 */
export function ErrorBar({ error }: { error?: string | null }) {
  if (!error) return null;
  return <div className="crypto-error">{error}</div>;
}

/** 黄色风险提示条，用于 ECB、PKCS#1 v1.5 这类弱方案。 */
export function WarnBar({ children }: { children: ReactNode }) {
  return <div className="crypto-notice">{children}</div>;
}

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
    <div className="crypto-frame">
      <div className="crypto-frame-head">
        <h2 className="crypto-frame-title">{title}</h2>
        {desc && <p className="crypto-frame-desc">{desc}</p>}
      </div>
      {children}
    </div>
  );
}

/** 执行按钮，计算中禁用避免重复提交。 */
export function RunButton({
  onClick,
  busy,
  label,
}: {
  onClick: () => void;
  busy: boolean;
  label: string;
}) {
  return (
    <button className="crypto-btn-primary" onClick={onClick} disabled={busy}>
      {busy ? "计算中…" : label}
    </button>
  );
}

/**
 * 调用 /api/crypto 的统一封装。
 *
 * 后端对参数与算法失败统一返回 400 + { ok:false, error }，
 * 故这里不按 HTTP 状态码分支，一律读响应体的 ok 字段。
 */
export async function callCrypto<T = string>(
  body: Record<string, unknown>
): Promise<{ ok: boolean; value?: T; error?: string }> {
  try {
    const res = await fetch("/api/crypto", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return data.ok ? { ok: true, value: data.value as T } : { ok: false, error: data.error };
  } catch (e) {
    return { ok: false, error: `请求失败：${e instanceof Error ? e.message : String(e)}` };
  }
}

export const INPUT_ENCODINGS: InputEncoding[] = ["utf8", "hex", "base64"];
export const BINARY_ENCODINGS: InputEncoding[] = ["hex", "base64"];
export const OUTPUT_ENCODINGS: OutputEncoding[] = ["hex", "base64"];

export const HASH_OPTIONS = [
  { value: "md5" as const, label: "MD5" },
  { value: "sha1" as const, label: "SHA1" },
  { value: "sha256" as const, label: "SHA256" },
  { value: "sha512" as const, label: "SHA512" },
];
