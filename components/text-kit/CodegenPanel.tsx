"use client";

import { useMemo } from "react";
import { inferFromJson, ReviewNote } from "@/lib/text-kit/codegen/infer";
import { generateTypeScript } from "@/lib/text-kit/codegen/typescript";
import { generateJava } from "@/lib/text-kit/codegen/java";
import { generateGo } from "@/lib/text-kit/codegen/go";
import { generateJsonSchema } from "@/lib/text-kit/codegen/jsonschema";
import { checkSize } from "@/lib/text-kit/limits";
import { PanelFrame, TextField, Select, CopyButton, ErrorBar, NoticeBar } from "./shared";

export type CodegenTarget = "typescript" | "java" | "go" | "jsonschema";

const TARGETS: readonly { value: CodegenTarget; label: string }[] = [
  { value: "typescript", label: "TypeScript interface" },
  { value: "java", label: "Java POJO" },
  { value: "go", label: "Go struct" },
  { value: "jsonschema", label: "JSON Schema" },
];

const GENERATORS = {
  typescript: generateTypeScript,
  java: generateJava,
  go: generateGo,
  jsonschema: generateJsonSchema,
} as const;

export interface CodegenState {
  input: string;
  target: CodegenTarget;
}

export const CODEGEN_INITIAL: CodegenState = { input: "", target: "typescript" };

/**
 * 类型代码生成面板。
 *
 * 需人工确认清单是本面板真正的价值所在：JSON 样本里没有类型信息，工具一直
 * 在猜，把猜不准的地方显式列出来比多支持一门语言重要得多。清单为空时不展示，
 * 免得每次都弹一条无谓的警告。
 */
export function CodegenPanel({
  state,
  setState,
}: {
  state: CodegenState;
  setState: (patch: Partial<CodegenState>) => void;
}) {
  const result = useMemo(() => {
    const empty = { code: "", notes: [] as ReviewNote[], error: "" };
    const over = checkSize(state.input);
    if (over) return { ...empty, error: over.error! };
    if (!state.input.trim()) return empty;

    const inferred = inferFromJson(state.input);
    if (!inferred.ok) return { ...empty, error: inferred.error! };

    const out = GENERATORS[state.target](inferred.value!);
    return { code: out.code, notes: [...inferred.value!.notes, ...out.notes], error: "" };
  }, [state]);

  return (
    <PanelFrame
      title="类型代码生成"
      desc="粘贴一份 JSON 样本，生成对应的类型定义。嵌套对象生成具名子类型，数组元素的字段取并集。"
    >
      <NoticeBar>
        生成结果由<strong>样本推断</strong>得出，不是权威 schema——样本里没有类型信息，
        字段是否可空、数值精度、空数组的元素类型都需要人工核对后再用。
      </NoticeBar>

      <div className="tk-toolbar">
        <Select
          label="目标语言"
          value={state.target}
          onChange={(v) => setState({ target: v })}
          options={TARGETS}
          width={190}
        />
      </div>

      <TextField
        label="JSON 样本"
        value={state.input}
        onChange={(v) => setState({ input: v })}
        placeholder={'{\n  "id": 1,\n  "user": { "name": "张三" },\n  "tags": ["a"]\n}'}
        minHeight="200px"
      />

      <ErrorBar error={result.error} />

      <TextField
        label="生成结果"
        value={result.code}
        readOnly
        minHeight="240px"
        actions={<CopyButton text={result.code} />}
      />

      {result.notes.length > 0 && (
        <div className="tk-field">
          <span className="tk-label">需人工确认的字段（{result.notes.length}）</span>
          <div className="tk-review">
            {result.notes.map((n, i) => (
              <div key={`${n.path}-${i}`} className="tk-review-item">
                <strong>{n.path || "(根)"}</strong> — {n.reason}
              </div>
            ))}
          </div>
        </div>
      )}
    </PanelFrame>
  );
}
