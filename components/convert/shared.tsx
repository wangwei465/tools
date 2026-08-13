"use client";

import { useState, ReactNode } from "react";
import CodeMirror, { EditorView, Extension } from "@uiw/react-codemirror";
import { json } from "@codemirror/lang-json";

/** 编码转换工具内 CodeMirror 的暗色主题，与 compare / api-client 风格一致。 */
export const convCmTheme = EditorView.theme({
  "&": { background: "var(--bg-input) !important" },
  ".cm-content": { padding: "10px 0" },
  ".cm-line": { padding: "0 12px" },
  ".cm-gutters": {
    background: "var(--bg-input)",
    borderRight: "1px solid var(--border)",
    color: "var(--text-muted)",
  },
  ".cm-activeLineGutter": { background: "rgba(255,255,255,0.04)" },
  ".cm-activeLine": { background: "rgba(255,255,255,0.03)" },
  ".cm-selectionBackground": { background: "rgba(91,124,250,0.25) !important" },
  ".cm-cursor": { borderLeftColor: "var(--accent) !important" },
});

interface CodeAreaProps {
  value: string;
  onChange?: (v: string) => void;
  /** 只读（输出区） */
  readOnly?: boolean;
  /** 是否启用 JSON 语法高亮 */
  jsonMode?: boolean;
  placeholder?: string;
  minHeight?: string;
}

/** 基于 CodeMirror 的输入/输出区，供各转换器复用。 */
export function CodeArea({
  value,
  onChange,
  readOnly = false,
  jsonMode = false,
  placeholder,
  minHeight = "200px",
}: CodeAreaProps) {
  const extensions: Extension[] = [convCmTheme];
  if (jsonMode) extensions.push(json());

  return (
    <CodeMirror
      value={value}
      onChange={onChange}
      extensions={extensions}
      readOnly={readOnly}
      placeholder={placeholder}
      theme="dark"
      style={{ minHeight, border: "1px solid var(--border)", borderRadius: "8px", overflow: "hidden" }}
      basicSetup={{
        lineNumbers: true,
        foldGutter: false,
        highlightActiveLine: !readOnly,
        bracketMatching: true,
        autocompletion: false,
        indentOnInput: true,
      }}
    />
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
    <button className="conv-copy" onClick={handle} disabled={!text}>
      {copied ? "已复制" : label}
    </button>
  );
}

/** 红色错误条：error 为空时不渲染。 */
export function ErrorBar({ error }: { error?: string | null }) {
  if (!error) return null;
  return <div className="conv-error">{error}</div>;
}

/** 转换器统一外框：标题 + 说明 + 内容。 */
export function ConverterFrame({
  title,
  desc,
  children,
}: {
  title: string;
  desc?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="conv-frame">
      <div className="conv-frame-head">
        <h2 className="conv-frame-title">{title}</h2>
        {desc && <p className="conv-frame-desc">{desc}</p>}
      </div>
      {children}
    </div>
  );
}
