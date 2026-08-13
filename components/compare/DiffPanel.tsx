"use client";

import { useState } from "react";
import type { DiffEntry } from "@/lib/compare/jsonDiff";
import type { JsonValue } from "@/lib/compare/normalize";
import { DiffFlat } from "./DiffFlat";
import { DiffTree } from "./DiffTree";
import { StringDiffPanel } from "./StringDiffPanel";

type ViewMode = "flat" | "tree";

interface Props {
  mode: "json" | "string";
  diffs: DiffEntry[];
  leftParsed: JsonValue | null;
  rightParsed: JsonValue | null;
  leftText: string;
  rightText: string;
  /** 某侧内容存在解析错误 */
  leftError: string | null;
  rightError: string | null;
}

/**
 * 差异结果区（任务 5.3 / 5.4 / 5.5）。
 * - JSON 模式：扁平路径 ↔ 树形高亮，两种视图可切换；某侧非法时展示错误提示。
 * - 字符串模式：逐行 diff；视图切换按钮禁用。
 */
export function DiffPanel({
  mode,
  diffs,
  leftParsed,
  rightParsed,
  leftText,
  rightText,
  leftError,
  rightError,
}: Props) {
  const [view, setView] = useState<ViewMode>("flat");
  const isJsonMode = mode === "json";

  const hasError = leftError || rightError;

  return (
    <div className="diff-panel">
      {/* 标题栏 + 视图切换 */}
      <div className="diff-panel-header">
        <span className="diff-panel-title">比对结果</span>
        <div className="view-tabs">
          <button
            className={`view-tab${view === "flat" ? " active" : ""}${!isJsonMode ? " disabled" : ""}`}
            onClick={() => isJsonMode && setView("flat")}
            disabled={!isJsonMode}
            title={!isJsonMode ? "字符串模式下不可用" : "扁平路径列表"}
          >
            扁平
          </button>
          <button
            className={`view-tab${view === "tree" ? " active" : ""}${!isJsonMode ? " disabled" : ""}`}
            onClick={() => isJsonMode && setView("tree")}
            disabled={!isJsonMode}
            title={!isJsonMode ? "字符串模式下不可用" : "树形高亮"}
          >
            树形
          </button>
        </div>
      </div>

      {/* 内容区 */}
      <div className="diff-panel-body">
        {/* 错误提示（某侧 JSON 非法，暂停比对） */}
        {isJsonMode && hasError && (
          <div className="diff-error-hint">
            {leftError && (
              <div className="error-msg">⚠ 左侧：{leftError}</div>
            )}
            {rightError && (
              <div className="error-msg">⚠ 右侧：{rightError}</div>
            )}
            <p className="error-sub">请修正 JSON 后比对将自动恢复。</p>
          </div>
        )}

        {/* 正常结果 */}
        {!hasError && isJsonMode && leftParsed !== null && rightParsed !== null && (
          view === "flat"
            ? <DiffFlat diffs={diffs} />
            : <DiffTree left={leftParsed} right={rightParsed} diffs={diffs} />
        )}

        {!hasError && !isJsonMode && (
          <StringDiffPanel left={leftText} right={rightText} />
        )}

        {/* 两侧均为空 */}
        {!hasError && isJsonMode && leftParsed === null && rightParsed === null && (
          <div className="diff-placeholder">在上方粘入内容后自动比对</div>
        )}
      </div>
    </div>
  );
}
