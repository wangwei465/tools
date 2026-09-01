"use client";

import { useMemo } from "react";
import { convertNamingLines, NamingStyle, NAMING_STYLES, SPLIT_RULES } from "@/lib/text-kit/naming";
import { toLines, toText } from "@/lib/text-kit/lines";
import { checkSize } from "@/lib/text-kit/limits";
import { PanelFrame, TextField, Select, CopyButton, ErrorBar } from "./shared";

export interface NamingState {
  input: string;
  style: NamingStyle;
}

export const NAMING_INITIAL: NamingState = { input: "", style: "snake" };

/**
 * 命名风格转换面板。
 *
 * 界面上直接展示分词规则表：HTTPServer、address1、user2Name 这类输入的切法
 * 存在真实歧义，与其让用户试出来，不如把工具的规则摊开写清楚。
 */
export function NamingPanel({
  state,
  setState,
}: {
  state: NamingState;
  setState: (patch: Partial<NamingState>) => void;
}) {
  const result = useMemo(() => {
    const over = checkSize(state.input);
    if (over) return { text: "", error: over.error! };
    if (!state.input.trim()) return { text: "", error: "" };
    return { text: toText(convertNamingLines(toLines(state.input), state.style)), error: "" };
  }, [state]);

  return (
    <PanelFrame
      title="命名风格转换"
      desc="逐行批量转换，行数与顺序不变。任意输入先按下方规则分词，再按目标风格重组。"
    >
      <div className="tk-toolbar">
        <Select
          label="目标风格"
          value={state.style}
          onChange={(v) => setState({ style: v })}
          options={NAMING_STYLES}
          width={160}
        />
      </div>

      <TextField
        label="输入"
        value={state.input}
        onChange={(v) => setState({ input: v })}
        placeholder={"每行一个标识符，例如\nfooBarBaz\nHTTPServer\nuser2Name"}
        minHeight="150px"
      />

      <ErrorBar error={result.error} />

      <TextField
        label="结果"
        value={result.text}
        readOnly
        minHeight="150px"
        actions={<CopyButton text={result.text} />}
      />

      <div className="tk-field">
        <span className="tk-label">分词规则</span>
        <table className="tk-rules">
          <thead>
            <tr>
              <th>规则</th>
              <th>输入</th>
              <th>分词结果</th>
            </tr>
          </thead>
          <tbody>
            {SPLIT_RULES.map((r) => (
              <tr key={r.input}>
                <td>{r.rule}</td>
                <td>
                  <code>{r.input}</code>
                </td>
                <td>
                  <code>{r.output.split(" ").join(" · ")}</code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </PanelFrame>
  );
}
