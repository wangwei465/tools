"use client";

import { useMemo, useState } from "react";
import {
  toLines,
  toText,
  dedupe,
  sortLines,
  removeEmpty,
  trimLines,
  affix,
  numberLines,
  reverseLines,
  setOperate,
  SortMode,
  SetOp,
} from "@/lib/text-kit/lines";
import { checkSize } from "@/lib/text-kit/limits";
import { PanelFrame, TextField, Select, Checkbox, InlineInput, CopyButton, ErrorBar } from "./shared";

const SORT_MODES: readonly { value: SortMode; label: string }[] = [
  { value: "lexical", label: "字典序" },
  { value: "numeric", label: "数值" },
  { value: "length", label: "行长度" },
];

const SET_OPS: readonly { value: SetOp; label: string }[] = [
  { value: "intersect", label: "交集（两侧都有）" },
  { value: "difference", label: "差集（左有右无）" },
  { value: "union", label: "并集（合并去重）" },
];

export interface LinesState {
  input: string;
  right: string;
  doTrim: boolean;
  doRemoveEmpty: boolean;
  doDedupe: boolean;
  doSort: boolean;
  sortMode: SortMode;
  sortDesc: boolean;
  doReverse: boolean;
  prefix: string;
  suffix: string;
  doNumber: boolean;
  numberStart: string;
  setMode: boolean;
  setOp: SetOp;
}

export const LINES_INITIAL: LinesState = {
  input: "",
  right: "",
  doTrim: false,
  doRemoveEmpty: false,
  doDedupe: false,
  doSort: false,
  sortMode: "lexical",
  sortDesc: false,
  doReverse: false,
  prefix: "",
  suffix: "",
  doNumber: false,
  numberStart: "1",
  setMode: false,
  setOp: "intersect",
};

/**
 * 行处理面板。
 *
 * 各项开关按固定顺序流水线执行：清理 → 集合运算 → 去重 → 排序 → 反转 → 加缀 → 行号。
 * 顺序写死而非让用户拖拽——加缀在排序之前会让排序结果被前缀带偏，这类
 * 组合几乎总是用户不想要的。
 */
export function LinesPanel({
  state,
  setState,
}: {
  state: LinesState;
  setState: (patch: Partial<LinesState>) => void;
}) {
  const result = useMemo(() => {
    const over = checkSize(state.input) ?? checkSize(state.right);
    if (over) return { text: "", error: over.error! };
    if (!state.input.trim()) return { text: "", error: "" };

    let lines = toLines(state.input);
    if (state.doTrim) lines = trimLines(lines);
    if (state.doRemoveEmpty) lines = removeEmpty(lines);
    if (state.setMode) lines = setOperate(lines, toLines(state.right), state.setOp);
    if (state.doDedupe) lines = dedupe(lines);
    if (state.doSort) {
      const r = sortLines(lines, state.sortMode, state.sortDesc);
      if (!r.ok) return { text: "", error: r.error! };
      lines = r.value!;
    }
    if (state.doReverse) lines = reverseLines(lines);
    lines = affix(lines, state.prefix, state.suffix);
    if (state.doNumber) {
      const start = Number(state.numberStart);
      if (!Number.isInteger(start)) return { text: "", error: "行号起始值需为整数" };
      lines = numberLines(lines, start);
    }
    return { text: toText(lines), error: "" };
  }, [state]);

  return (
    <PanelFrame
      title="行处理"
      desc="去重 / 排序 / 清理 / 加缀 / 行号 / 反转，以及两组文本的集合运算。结果随输入实时更新。"
    >
      <div className="tk-toolbar">
        <Checkbox label="去首尾空白" checked={state.doTrim} onChange={(v) => setState({ doTrim: v })} />
        <Checkbox label="去空行" checked={state.doRemoveEmpty} onChange={(v) => setState({ doRemoveEmpty: v })} />
        <Checkbox label="去重（保序）" checked={state.doDedupe} onChange={(v) => setState({ doDedupe: v })} />
        <Checkbox label="整体反转" checked={state.doReverse} onChange={(v) => setState({ doReverse: v })} />
      </div>

      <div className="tk-toolbar">
        <Checkbox label="排序" checked={state.doSort} onChange={(v) => setState({ doSort: v })} />
        <Select
          value={state.sortMode}
          onChange={(v) => setState({ sortMode: v })}
          options={SORT_MODES}
          width={110}
        />
        <Checkbox label="反序" checked={state.sortDesc} onChange={(v) => setState({ sortDesc: v })} />
        <Checkbox label="加行号" checked={state.doNumber} onChange={(v) => setState({ doNumber: v })} />
        <InlineInput
          label="起始"
          value={state.numberStart}
          onChange={(v) => setState({ numberStart: v })}
          width={70}
        />
      </div>

      <div className="tk-toolbar">
        <InlineInput label="前缀" value={state.prefix} onChange={(v) => setState({ prefix: v })} width={130} />
        <InlineInput label="后缀" value={state.suffix} onChange={(v) => setState({ suffix: v })} width={130} />
      </div>

      <div className="tk-toolbar">
        <Checkbox label="集合运算" checked={state.setMode} onChange={(v) => setState({ setMode: v })} />
        <Select value={state.setOp} onChange={(v) => setState({ setOp: v })} options={SET_OPS} width={170} />
      </div>

      {state.setMode ? (
        <div className="tk-two-col">
          <TextField
            label="左侧文本"
            value={state.input}
            onChange={(v) => setState({ input: v })}
            placeholder="每行一个元素"
          />
          <TextField
            label="右侧文本"
            value={state.right}
            onChange={(v) => setState({ right: v })}
            placeholder="每行一个元素"
          />
        </div>
      ) : (
        <TextField
          label="输入"
          value={state.input}
          onChange={(v) => setState({ input: v })}
          placeholder="每行一条内容"
          minHeight="180px"
        />
      )}

      <ErrorBar error={result.error} />

      <TextField
        label={`结果${result.text ? `（${toLines(result.text).length} 行）` : ""}`}
        value={result.text}
        readOnly
        minHeight="180px"
        actions={<CopyButton text={result.text} />}
      />
    </PanelFrame>
  );
}
