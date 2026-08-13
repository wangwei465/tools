"use client";

import { useCallback, useMemo, useState } from "react";
import CodeMirror, { EditorView } from "@uiw/react-codemirror";
import { json, jsonParseLinter } from "@codemirror/lang-json";
import { linter } from "@codemirror/lint";

interface Props {
  /** 当前文本内容 */
  value: string;
  /** 内容变更回调 */
  onChange: (value: string) => void;
  /** 标识左侧或右侧，用于无障碍 aria-label */
  side: "left" | "right";
  /** 是否为 JSON 模式；字符串模式下不启用 JSON linter */
  jsonMode: boolean;
}

const LABEL = { left: "左侧输入", right: "右侧输入" };

/**
 * 基于 CodeMirror 6 的输入区。
 *
 * 三层数据分离（设计决策）：
 * - 该组件只负责"格式化展示"层：缩进、高亮、错误标注。
 * - 上层负责"规范化"与"diff"，从 value 中独立计算，不依赖本组件的内部状态。
 */
export function CompareEditor({ value, onChange, side, jsonMode }: Props) {
  const [isCompressed, setIsCompressed] = useState(false);

  /** 格式化按钮：美化 JSON 缩进；若非法则不操作。 */
  const handleFormat = useCallback(() => {
    if (!jsonMode) return;
    try {
      const parsed = JSON.parse(value);
      onChange(JSON.stringify(parsed, null, 2));
      setIsCompressed(false);
    } catch {
      // 非法 JSON：不操作，让 linter 标注错误
    }
  }, [value, onChange, jsonMode]);

  /** 压缩/格式化切换：仅改变展示形式，不影响参与比对的数据（上层从 value 读取）。 */
  const handleToggleCompress = useCallback(() => {
    if (!jsonMode) return;
    try {
      const parsed = JSON.parse(value);
      if (isCompressed) {
        onChange(JSON.stringify(parsed, null, 2));
        setIsCompressed(false);
      } else {
        onChange(JSON.stringify(parsed));
        setIsCompressed(true);
      }
    } catch {
      // 非法 JSON：不操作
    }
  }, [value, isCompressed, onChange, jsonMode]);

  // CodeMirror 扩展：JSON 高亮 + linter（仅 JSON 模式）
  const extensions = useMemo(() => {
    const base = [
      EditorView.theme({
        "&": { background: "var(--bg-input) !important" },
        ".cm-content": { padding: "12px 0" },
        ".cm-line": { padding: "0 12px" },
        ".cm-gutters": {
          background: "var(--bg-input)",
          borderRight: "1px solid var(--border)",
          color: "var(--text-muted)",
        },
        ".cm-activeLineGutter": { background: "rgba(255,255,255,0.04)" },
        ".cm-activeLine": { background: "rgba(255,255,255,0.03)" },
        ".cm-selectionBackground": {
          background: "rgba(91,124,250,0.25) !important",
        },
        ".cm-cursor": { borderLeftColor: "var(--accent) !important" },
      }),
    ];
    if (jsonMode) {
      return [...base, json(), linter(jsonParseLinter())];
    }
    return base;
  }, [jsonMode]);

  return (
    <div className="editor-wrapper">
      {/* 工具栏 */}
      <div className="editor-toolbar">
        <span className="editor-label">{LABEL[side]}</span>
        {jsonMode && (
          <div className="editor-actions">
            <button
              className="btn-tool"
              onClick={handleFormat}
              title="格式化 JSON（缩进展示）"
            >
              格式化
            </button>
            <button
              className="btn-tool"
              onClick={handleToggleCompress}
              title={isCompressed ? "展开格式化" : "压缩为单行"}
            >
              {isCompressed ? "展开" : "压缩"}
            </button>
          </div>
        )}
      </div>

      {/* 编辑区 */}
      <CodeMirror
        value={value}
        onChange={onChange}
        extensions={extensions}
        aria-label={LABEL[side]}
        style={{ flex: 1, overflow: "hidden" }}
        theme="dark"
        basicSetup={{
          lineNumbers: true,
          foldGutter: true,
          highlightActiveLine: true,
          bracketMatching: true,
          autocompletion: false,
          indentOnInput: true,
        }}
      />

    </div>
  );
}
