"use client";

import { useMemo, useState } from "react";
import { jsonToYaml, yamlToJson, formatJson, minifyJson } from "@/lib/convert/jsonYaml";
import { CodeArea, CopyButton, ErrorBar, ConverterFrame } from "./shared";

type Direction = "j2y" | "y2j";

/** JSON ⇔ YAML 互转 + JSON 美化/压缩。输出随输入与方向实时计算。 */
export function JsonYamlConverter() {
  const [direction, setDirection] = useState<Direction>("j2y");
  const [input, setInput] = useState("");

  const result = useMemo(() => {
    if (!input.trim()) return { ok: true, value: "" };
    return direction === "j2y" ? jsonToYaml(input) : yamlToJson(input);
  }, [input, direction]);

  const inputIsJson = direction === "j2y";

  // 美化/压缩仅在 JSON 输入侧可用，直接改写输入
  const applyFormat = (fn: typeof formatJson) => {
    const r = fn(input);
    if (r.ok) setInput(r.value!);
  };

  return (
    <ConverterFrame title="JSON ⇔ YAML" desc="双向互转，附 JSON 美化 / 压缩。非法输入将提示错误。">
      <div className="conv-toolbar">
        <div className="conv-seg">
          <button
            className={`conv-seg-btn${direction === "j2y" ? " active" : ""}`}
            onClick={() => setDirection("j2y")}
          >
            JSON → YAML
          </button>
          <button
            className={`conv-seg-btn${direction === "y2j" ? " active" : ""}`}
            onClick={() => setDirection("y2j")}
          >
            YAML → JSON
          </button>
        </div>
        {inputIsJson && (
          <div className="conv-toolbar-actions">
            <button className="btn-tool" onClick={() => applyFormat(formatJson)}>
              美化输入
            </button>
            <button className="btn-tool" onClick={() => applyFormat(minifyJson)}>
              压缩输入
            </button>
          </div>
        )}
      </div>

      <div className="conv-io">
        <div className="conv-io-col">
          <label className="conv-io-label">输入（{inputIsJson ? "JSON" : "YAML"}）</label>
          <CodeArea
            value={input}
            onChange={setInput}
            jsonMode={inputIsJson}
            placeholder={inputIsJson ? '{"key": "value"}' : "key: value"}
          />
        </div>
        <div className="conv-io-col">
          <div className="conv-io-labelrow">
            <label className="conv-io-label">输出（{inputIsJson ? "YAML" : "JSON"}）</label>
            <CopyButton text={result.ok ? result.value ?? "" : ""} />
          </div>
          <CodeArea value={result.ok ? result.value ?? "" : ""} readOnly jsonMode={!inputIsJson} />
        </div>
      </div>
      <ErrorBar error={result.ok ? null : result.error} />
    </ConverterFrame>
  );
}
