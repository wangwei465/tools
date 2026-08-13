"use client";

import { useCallback, useEffect, useState } from "react";
import { canonicalize, parseJson } from "@/lib/compare/normalize";
import { sha256Hex } from "@/lib/compare/hash";
import { diffJson, type DiffEntry } from "@/lib/compare/jsonDiff";
import type { JsonValue } from "@/lib/compare/normalize";

export type CompareMode = "json" | "string";

interface CompareSideState {
  /** 用户输入的原始文本（经格式化展示，但这里存的是真实文本） */
  text: string;
  /** hash 计算结果；null = 内容无效或未计算 */
  hash: string | null;
  /** JSON 解析结果；字符串模式下始终为 null */
  parsed: JsonValue | null;
  /** 是否是合法的 JSON（JSON 模式下有效） */
  valid: boolean;
  /** 解析错误信息 */
  error: string | null;
}

export interface CompareState {
  mode: CompareMode;
  left: CompareSideState;
  right: CompareSideState;
  /** 两侧 hash 是否一致；null = 无法计算（某侧无效） */
  isEqual: boolean | null;
  /** JSON diff 结果；仅 JSON 模式 + 两侧有效时有值 */
  diffs: DiffEntry[];
}

const EMPTY_SIDE: CompareSideState = {
  text: "",
  hash: null,
  parsed: null,
  valid: false,
  error: null,
};

/** 计算单侧状态（同步部分，不含异步 hash） */
function parseSide(
  text: string,
  mode: CompareMode
): Omit<CompareSideState, "hash"> {
  if (mode === "string") {
    return { text, parsed: null, valid: true, error: null };
  }
  if (text.trim() === "") {
    return { text, parsed: null, valid: false, error: null };
  }
  const result = parseJson(text);
  if (!result.ok) {
    return { text, parsed: null, valid: false, error: result.error ?? "无效的 JSON" };
  }
  return { text, parsed: result.value!, valid: true, error: null };
}

/**
 * 比对逻辑聚合 hook。
 *
 * 负责：
 * - 接收两侧文本和当前模式
 * - JSON 模式：解析、规范化、计算 hash、diff
 * - 字符串模式：原始文本计算 hash
 * - 返回完整的 CompareState 供 UI 渲染
 *
 * 此 hook 是三层分离（格式化/规范化/diff）的"规范化 + diff"层实现。
 */
export function useCompare() {
  const [mode, setMode] = useState<CompareMode>("json");
  const [leftText, setLeftText] = useState("");
  const [rightText, setRightText] = useState("");
  const [state, setState] = useState<CompareState>({
    mode: "json",
    left: EMPTY_SIDE,
    right: EMPTY_SIDE,
    isEqual: null,
    diffs: [],
  });

  // 每当输入文本或模式变化，重新计算（含异步 hash）
  useEffect(() => {
    let cancelled = false;

    async function compute() {
      const leftSide = parseSide(leftText, mode);
      const rightSide = parseSide(rightText, mode);

      let leftHash: string | null = null;
      let rightHash: string | null = null;

      if (mode === "json") {
        // JSON 模式：对规范化后的字符串计算 hash（两侧都必须有效）
        if (leftSide.valid && leftSide.parsed !== undefined) {
          leftHash = await sha256Hex(canonicalize(leftSide.parsed!));
        }
        if (rightSide.valid && rightSide.parsed !== undefined) {
          rightHash = await sha256Hex(canonicalize(rightSide.parsed!));
        }
      } else {
        // 字符串模式：对原始文本计算 hash（非空才算）
        if (leftText.trim()) leftHash = await sha256Hex(leftText);
        if (rightText.trim()) rightHash = await sha256Hex(rightText);
      }

      if (cancelled) return;

      // 一致性判定
      const isEqual =
        leftHash !== null && rightHash !== null ? leftHash === rightHash : null;

      // JSON diff（仅两侧都有效时）
      let diffs: DiffEntry[] = [];
      if (
        mode === "json" &&
        leftSide.valid &&
        rightSide.valid &&
        leftSide.parsed !== null &&
        rightSide.parsed !== null
      ) {
        diffs = diffJson(leftSide.parsed, rightSide.parsed);
      }

      setState({
        mode,
        left: { ...leftSide, hash: leftHash },
        right: { ...rightSide, hash: rightHash },
        isEqual,
        diffs,
      });
    }

    void compute();
    return () => {
      cancelled = true;
    };
  }, [leftText, rightText, mode]);

  const handleModeChange = useCallback((m: CompareMode) => {
    setMode(m);
  }, []);

  return {
    state,
    leftText,
    rightText,
    setLeftText,
    setRightText,
    handleModeChange,
  };
}
