"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CompareEditor } from "@/components/compare/CompareEditor";
import { HashPanel } from "@/components/compare/HashPanel";
import { DiffPanel } from "@/components/compare/DiffPanel";
import { RequestBar } from "@/components/compare/RequestBar";
import { TokenSettings } from "@/components/compare/TokenSettings";
import { HistoryManager } from "@/components/compare/HistoryManager";
import { useCompare, type CompareMode } from "@/components/compare/useCompare";

/**
 * 数据比对工具主页面（任务 2.1–2.3）。
 *
 * 布局：顶部模式切换 → 左右编辑器 → hash 面板 → 差异结果区。
 * 所有比对逻辑通过 useCompare hook 聚合，组件只做渲染。
 */
export default function ComparePage() {
  const {
    state,
    leftText,
    rightText,
    setLeftText,
    setRightText,
    handleModeChange,
  } = useCompare();

  // 编辑器区高度占比（0.2–0.8），可通过分隔条拖拽调整。
  // 默认 0.42：既能看到输入的原始 JSON，又给差异结果留足空间。
  const [editorRatio, setEditorRatio] = useState(0.42);
  const containerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  // 统一请求设置弹窗开关
  const [tokenSettingsOpen, setTokenSettingsOpen] = useState(false);
  // 历史记录管理弹窗开关
  const [historyOpen, setHistoryOpen] = useState(false);

  const startDrag = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    draggingRef.current = true;
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
  }, []);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!draggingRef.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const ratio = (e.clientY - rect.top) / rect.height;
      setEditorRatio(Math.min(0.8, Math.max(0.2, ratio)));
    };
    const onUp = () => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  // JSON 模式粘贴后自动格式化：监听粘贴事件，尝试美化
  const autoFormat = useCallback(
    (text: string, setter: (v: string) => void) => {
      if (state.mode !== "json") return text;
      try {
        const parsed = JSON.parse(text.trim());
        const formatted = JSON.stringify(parsed, null, 2);
        setter(formatted);
        return formatted;
      } catch {
        // 非法 JSON：不格式化，原样设置
        setter(text);
        return text;
      }
    },
    [state.mode]
  );

  const handleLeftChange = useCallback(
    (v: string) => {
      // CodeMirror onChange 是逐键触发；粘贴大文本时同样触发，
      // 只有当内容是合法 JSON 时才格式化（避免打字过程中频繁格式化）
      if (state.mode === "json") {
        autoFormat(v, setLeftText);
      } else {
        setLeftText(v);
      }
    },
    [state.mode, autoFormat, setLeftText]
  );

  const handleRightChange = useCallback(
    (v: string) => {
      if (state.mode === "json") {
        autoFormat(v, setRightText);
      } else {
        setRightText(v);
      }
    },
    [state.mode, autoFormat, setRightText]
  );

  // 接口请求成功后回填：代理已返回格式化 JSON，直接写入即可触发比对
  const handleLeftFilled = useCallback(
    (json: string) => setLeftText(json),
    [setLeftText]
  );
  const handleRightFilled = useCallback(
    (json: string) => setRightText(json),
    [setRightText]
  );

  // 切换模式时清空内容，避免两侧遗留的旧格式数据干扰
  const onModeChange = useCallback(
    (m: CompareMode) => {
      setLeftText("");
      setRightText("");
      handleModeChange(m);
    },
    [setLeftText, setRightText, handleModeChange]
  );

  return (
    <div className="compare-page">
      {/* 顶部：标题 + 模式切换 */}
      <div className="compare-header">
        <h1 className="compare-title">数据比对</h1>
        <div className="mode-tabs">
          <button
            className={`mode-tab${state.mode === "json" ? " active" : ""}`}
            onClick={() => onModeChange("json")}
          >
            JSON
          </button>
          <button
            className={`mode-tab${state.mode === "string" ? " active" : ""}`}
            onClick={() => onModeChange("string")}
          >
            字符串
          </button>
        </div>
        <button className="settings-entry" onClick={() => setHistoryOpen(true)}>
          📋 历史记录
        </button>
        <button
          className="settings-entry"
          onClick={() => setTokenSettingsOpen(true)}
        >
          ⚙ 统一请求设置
        </button>
      </div>

      {/* 可拖拽的上下分栏区：上=编辑器+Hash，下=差异结果 */}
      <div className="compare-split" ref={containerRef}>
        {/* 上半：左右编辑器 + Hash 面板 */}
        <div className="split-top" style={{ flexGrow: editorRatio }}>
          <div className="compare-editors">
            <div className="editor-column">
              {state.mode === "json" && (
                <RequestBar side="left" onFilled={handleLeftFilled} />
              )}
              <CompareEditor
                value={leftText}
                onChange={handleLeftChange}
                side="left"
                jsonMode={state.mode === "json"}
              />
            </div>
            <div className="editor-column">
              {state.mode === "json" && (
                <RequestBar side="right" onFilled={handleRightFilled} />
              )}
              <CompareEditor
                value={rightText}
                onChange={handleRightChange}
                side="right"
                jsonMode={state.mode === "json"}
              />
            </div>
          </div>
          <HashPanel
            leftHash={state.left.hash}
            rightHash={state.right.hash}
            isEqual={state.isEqual}
          />
        </div>

        {/* 拖拽分隔条 */}
        <div
          className="split-handle"
          onMouseDown={startDrag}
          title="拖拽调整上下区域高度"
        >
          <span className="split-handle-grip" />
        </div>

        {/* 下半：差异结果区 */}
        <div className="split-bottom" style={{ flexGrow: 1 - editorRatio }}>
          <DiffPanel
            mode={state.mode}
            diffs={state.diffs}
            leftParsed={state.left.parsed}
            rightParsed={state.right.parsed}
            leftText={leftText}
            rightText={rightText}
            leftError={state.left.error}
            rightError={state.right.error}
          />
        </div>
      </div>

      <TokenSettings open={tokenSettingsOpen} onClose={() => setTokenSettingsOpen(false)} />
      <HistoryManager open={historyOpen} onClose={() => setHistoryOpen(false)} />
    </div>
  );
}
