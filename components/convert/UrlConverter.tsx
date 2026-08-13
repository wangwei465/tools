"use client";

import { useMemo, useState } from "react";
import { encodeUrl, decodeUrl, UrlScope } from "@/lib/convert/url";
import { CodeArea, CopyButton, ErrorBar, ConverterFrame } from "./shared";

type Mode = "encode" | "decode";

/** URL 编解码，区分 component（编码单个参数）与整串（编码整条 URL）。 */
export function UrlConverter() {
  const [mode, setMode] = useState<Mode>("encode");
  const [scope, setScope] = useState<UrlScope>("component");
  const [input, setInput] = useState("");

  const result = useMemo(() => {
    if (!input) return { ok: true, value: "" };
    return mode === "encode" ? encodeUrl(input, scope) : decodeUrl(input, scope);
  }, [input, mode, scope]);

  return (
    <ConverterFrame title="URL 编解码" desc="component 转义分隔符（& = ? #），整串保留 URL 结构。">
      <div className="conv-toolbar">
        <div className="conv-seg">
          <button className={`conv-seg-btn${mode === "encode" ? " active" : ""}`} onClick={() => setMode("encode")}>
            编码
          </button>
          <button className={`conv-seg-btn${mode === "decode" ? " active" : ""}`} onClick={() => setMode("decode")}>
            解码
          </button>
        </div>
        <div className="conv-seg">
          <button
            className={`conv-seg-btn${scope === "component" ? " active" : ""}`}
            onClick={() => setScope("component")}
          >
            component
          </button>
          <button className={`conv-seg-btn${scope === "full" ? " active" : ""}`} onClick={() => setScope("full")}>
            整串
          </button>
        </div>
      </div>

      <div className="conv-io">
        <div className="conv-io-col">
          <label className="conv-io-label">输入</label>
          <CodeArea value={input} onChange={setInput} minHeight="120px" placeholder="a=1&b=2 或 https://x.com/a b" />
        </div>
        <div className="conv-io-col">
          <div className="conv-io-labelrow">
            <label className="conv-io-label">输出</label>
            <CopyButton text={result.ok ? result.value ?? "" : ""} />
          </div>
          <CodeArea value={result.ok ? result.value ?? "" : ""} readOnly minHeight="120px" />
        </div>
      </div>
      <ErrorBar error={result.ok ? null : result.error} />
    </ConverterFrame>
  );
}
