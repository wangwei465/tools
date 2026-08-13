"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { json, jsonParseLinter } from "@codemirror/lang-json";
import { linter } from "@codemirror/lint";
import { cmTheme } from "@/components/api-client/cmTheme";

/** 是否合法 JSON（先按首字符快速排除，避免每个值都 parse）。 */
export function isJsonText(text: string): boolean {
  const t = text.trim();
  if (!t || (t[0] !== "{" && t[0] !== "[")) return false;
  try {
    JSON.parse(t);
    return true;
  } catch {
    return false;
  }
}

/** JSON 美化（非 JSON 原样返回）。 */
function pretty(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

/** JSON 压缩为单行（非 JSON 原样返回）。 */
function minify(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text));
  } catch {
    return text;
  }
}

interface Props {
  value: string;
  readonly: boolean;
  onSave: (value: string) => void;
  onError: (msg: string) => void;
  headerLeft?: ReactNode; // 标题区（如字段名）
  headerActions?: ReactNode; // 额外操作（如删除字段）
  saveLabel?: string;
}

/**
 * 值详情编辑器：CodeMirror JSON 语法高亮 + 打开即自动美化便于阅读 + 压缩 / 复制 / 保存。
 * hash 字段值与 string 值共用（DRY），与 api-client 响应查看器风格一致。
 *
 * 基线（baseline）= 打开时的展示文本（JSON 自动美化）；脏判定与保存均以此为起点，
 * 故打开长 JSON 立即可读且不误判「未保存」。保存所见即所得，非 JSON 值不改动。
 */
export function ValueDetailEditor({
  value,
  readonly,
  onSave,
  onError,
  headerLeft,
  headerActions,
  saveLabel = "保存",
}: Props) {
  const baseline = useMemo(() => (isJsonText(value) ? pretty(value) : value), [value]);
  const [text, setText] = useState(baseline);
  const [copied, setCopied] = useState(false);

  // 切换字段 / 重载值：回到新基线
  useEffect(() => {
    setText(baseline);
    setCopied(false);
  }, [baseline]);

  const extensions = useMemo(() => [cmTheme, json(), linter(jsonParseLinter())], []);
  const dirty = text !== baseline;
  const canFormat = isJsonText(text);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      onError("复制失败");
    }
  };

  return (
    <div className="redis-vd">
      <div className="redis-vd-toolbar">
        {headerLeft}
        <div className="redis-header-spacer" />
        <button
          className="redis-btn-ghost-sm"
          disabled={!canFormat}
          title={canFormat ? "格式化 JSON" : "非 JSON 内容"}
          onClick={() => setText(pretty(text))}
        >
          美化
        </button>
        <button
          className="redis-btn-ghost-sm"
          disabled={!canFormat}
          title={canFormat ? "压缩为单行" : "非 JSON 内容"}
          onClick={() => setText(minify(text))}
        >
          压缩
        </button>
        <button className="redis-btn-ghost-sm" onClick={copy}>
          {copied ? "已复制" : "复制"}
        </button>
        {headerActions}
      </div>

      <div className="redis-vd-cm">
        <CodeMirror
          value={text}
          editable={!readonly}
          onChange={setText}
          extensions={extensions}
          theme="dark"
          height="100%"
          basicSetup={{
            lineNumbers: true,
            foldGutter: true,
            highlightActiveLine: !readonly,
            bracketMatching: true,
            autocompletion: false,
            indentOnInput: true,
          }}
        />
      </div>

      {!readonly && (
        <div className="redis-vd-actions">
          {dirty && <span className="redis-vd-dirty">● 未保存</span>}
          <div className="redis-header-spacer" />
          <button className="redis-btn-primary" disabled={!dirty} onClick={() => onSave(text)}>
            {saveLabel}
          </button>
        </div>
      )}
    </div>
  );
}
