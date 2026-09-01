"use client";

import { useMemo } from "react";
import { replaceText, ReplaceMode } from "@/lib/text-kit/replace";
import { checkSize } from "@/lib/text-kit/limits";
import {
  PanelFrame,
  TextField,
  Select,
  Checkbox,
  InlineInput,
  CopyButton,
  ErrorBar,
  HintBar,
} from "./shared";

const MODES: readonly { value: ReplaceMode; label: string }[] = [
  { value: "literal", label: "字面量" },
  { value: "regex", label: "正则" },
];

export interface ReplaceState {
  input: string;
  pattern: string;
  replacement: string;
  mode: ReplaceMode;
  ignoreCase: boolean;
  multiline: boolean;
}

export const REPLACE_INITIAL: ReplaceState = {
  input: "",
  pattern: "",
  replacement: "",
  mode: "literal",
  ignoreCase: false,
  multiline: false,
};

/**
 * 批量替换面板。
 *
 * 只做「应用」：输出替换后的完整文本与替换次数。匹配高亮、捕获组表格这类
 * 调试视图留在「编码转换」的正则测试面板，面板内给出指引。
 */
export function ReplacePanel({
  state,
  setState,
}: {
  state: ReplaceState;
  setState: (patch: Partial<ReplaceState>) => void;
}) {
  const result = useMemo(() => {
    const over = checkSize(state.input);
    if (over) return { text: "", count: 0, error: over.error! };
    if (!state.input || !state.pattern) return { text: "", count: 0, error: "" };
    const r = replaceText(state.input, state.pattern, state.replacement, {
      mode: state.mode,
      ignoreCase: state.ignoreCase,
      multiline: state.multiline,
    });
    if (!r.ok) return { text: "", count: 0, error: r.error! };
    return { ...r.value!, error: "" };
  }, [state]);

  return (
    <PanelFrame title="批量替换" desc="字面量与正则两种模式，作用于整段文本，输出结果与替换次数。">
      <HintBar>
        需要调试正则的匹配范围与捕获组？用「<strong>编码转换</strong>」里的正则测试面板，本面板只负责应用替换。
      </HintBar>

      <div className="tk-toolbar">
        <Select label="模式" value={state.mode} onChange={(v) => setState({ mode: v })} options={MODES} width={100} />
        <Checkbox label="忽略大小写" checked={state.ignoreCase} onChange={(v) => setState({ ignoreCase: v })} />
        <Checkbox label="多行模式（^ $ 匹配每行）" checked={state.multiline} onChange={(v) => setState({ multiline: v })} />
      </div>

      <div className="tk-toolbar">
        <InlineInput
          label="匹配"
          value={state.pattern}
          onChange={(v) => setState({ pattern: v })}
          placeholder={state.mode === "regex" ? "(\\d{4})-(\\d{2})" : "要替换的内容"}
          width={280}
        />
        <InlineInput
          label="替换为"
          value={state.replacement}
          onChange={(v) => setState({ replacement: v })}
          placeholder={state.mode === "regex" ? "$2/$1" : "新内容"}
          width={280}
        />
      </div>

      <TextField
        label="原文"
        value={state.input}
        onChange={(v) => setState({ input: v })}
        placeholder="粘贴要处理的文本"
        minHeight="180px"
      />

      <ErrorBar error={result.error} />

      <TextField
        label={`结果（替换 ${result.count} 处）`}
        value={result.text}
        readOnly
        minHeight="180px"
        actions={<CopyButton text={result.text} />}
      />
    </PanelFrame>
  );
}
