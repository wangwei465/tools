"use client";

import { useMemo } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { json, jsonParseLinter } from "@codemirror/lang-json";
import { linter } from "@codemirror/lint";
import type { BodyState, BodyType, FormField } from "./types";
import { emptyFormField } from "./types";
import { KVTable } from "./KVTable";
import { cmTheme } from "./cmTheme";
import { useFlash } from "./useFlash";

const BODY_TYPES: { key: BodyType; label: string }[] = [
  { key: "none", label: "none" },
  { key: "raw", label: "raw (JSON)" },
  { key: "form-data", label: "form-data" },
  { key: "urlencoded", label: "x-www-form-urlencoded" },
];

interface Props {
  body: BodyState;
  onChange: (patch: Partial<BodyState>) => void;
}

/** Body 编辑：类型单选 + 对应编辑区。 */
export function BodyEditor({ body, onChange }: Props) {
  const extensions = useMemo(() => [cmTheme, json(), linter(jsonParseLinter())], []);
  const [hint, flash] = useFlash();

  /** 美化：解析后按 2 空格缩进回写；非法 JSON 保留原文并提示。 */
  const beautify = () => {
    if (!body.raw.trim()) return;
    try {
      onChange({ raw: JSON.stringify(JSON.parse(body.raw), null, 2) });
      flash("已美化 ✓");
    } catch {
      flash("JSON 语法错误");
    }
  };

  return (
    <div className="apic-body">
      <div className="apic-body-types">
        {BODY_TYPES.map((t) => (
          <label key={t.key} className="apic-radio">
            <input
              type="radio"
              name="apic-bodytype"
              checked={body.type === t.key}
              onChange={() => onChange({ type: t.key })}
            />
            {t.label}
          </label>
        ))}
      </div>

      {body.type === "none" && <div className="apic-body-none">该请求不发送 Body</div>}

      {body.type === "raw" && (
        <div className="apic-body-cm">
          <div className="apic-cm-bar">
            {hint && <span className="apic-cm-hint">{hint}</span>}
            <button className="apic-tool-btn" onClick={beautify} title="格式化 JSON">
              美化
            </button>
          </div>
          <CodeMirror
            value={body.raw}
            onChange={(v) => onChange({ raw: v })}
            extensions={extensions}
            theme="dark"
            height="220px"
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
      )}

      {body.type === "urlencoded" && (
        <KVTable
          rows={body.urlencoded}
          onChange={(rows) => onChange({ urlencoded: rows })}
          keyPlaceholder="字段名"
          valuePlaceholder="值"
        />
      )}

      {body.type === "form-data" && (
        <FormDataTable
          fields={body.formData}
          onChange={(fields) => onChange({ formData: fields })}
        />
      )}
    </div>
  );
}

/** form-data 表格：每行文本或文件；文件选择时读为 base64 承载（内存态，不持久化）。 */
function FormDataTable({
  fields,
  onChange,
}: {
  fields: FormField[];
  onChange: (fields: FormField[]) => void;
}) {
  const update = (i: number, patch: Partial<FormField>) =>
    onChange(fields.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
  const add = () => onChange([...fields, emptyFormField()]);
  const remove = (i: number) => onChange(fields.filter((_, idx) => idx !== i));

  const pickFile = async (i: number, file: File) => {
    const base64 = await fileToBase64(file);
    update(i, { fileName: file.name, fileBase64: base64, value: file.name });
  };

  return (
    <div className="apic-kv">
      {fields.map((f, i) => (
        <div className="apic-kv-row" key={i}>
          <input
            type="checkbox"
            checked={f.enabled}
            onChange={(e) => update(i, { enabled: e.target.checked })}
            aria-label="启用该行"
          />
          <input
            className="apic-kv-key"
            value={f.key}
            placeholder="字段名"
            onChange={(e) => update(i, { key: e.target.value })}
          />
          <select
            className="apic-fd-kind"
            value={f.kind}
            onChange={(e) =>
              update(i, {
                kind: e.target.value as "text" | "file",
                value: "",
                fileName: undefined,
                fileBase64: undefined,
              })
            }
          >
            <option value="text">文本</option>
            <option value="file">文件</option>
          </select>
          {f.kind === "text" ? (
            <input
              className="apic-kv-val"
              value={f.value}
              placeholder="值"
              onChange={(e) => update(i, { value: e.target.value })}
            />
          ) : (
            <label className="apic-file">
              <span className="apic-file-name">{f.fileName ?? "选择文件…"}</span>
              <input
                type="file"
                hidden
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void pickFile(i, file);
                }}
              />
            </label>
          )}
          <button className="apic-kv-del" onClick={() => remove(i)} aria-label="删除">
            ✕
          </button>
        </div>
      ))}
      <button className="apic-kv-add" onClick={add}>
        + 添加字段
      </button>
    </div>
  );
}

/** 读文件为 base64（去掉 data URL 前缀）。 */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string; // data:<mime>;base64,<data>
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
