"use client";

import { useMemo, useState } from "react";
import { encodeBase64, decodeBase64 } from "@/lib/convert/base64";
import { CodeArea, CopyButton, ErrorBar, ConverterFrame } from "./shared";

type Mode = "encode" | "decode";

/** Base64 编解码，支持标准 / URL-safe 变体。 */
export function Base64Converter() {
  const [mode, setMode] = useState<Mode>("encode");
  const [urlSafe, setUrlSafe] = useState(false);
  const [input, setInput] = useState("");

  const result = useMemo(() => {
    if (!input) return { ok: true, value: "" };
    return mode === "encode" ? encodeBase64(input, urlSafe) : decodeBase64(input);
  }, [input, mode, urlSafe]);

  return (
    <ConverterFrame title="Base64" desc="UTF-8 安全编解码。解码自动兼容标准与 URL-safe 变体。">
      <div className="conv-toolbar">
        <div className="conv-seg">
          <button
            className={`conv-seg-btn${mode === "encode" ? " active" : ""}`}
            onClick={() => setMode("encode")}
          >
            编码
          </button>
          <button
            className={`conv-seg-btn${mode === "decode" ? " active" : ""}`}
            onClick={() => setMode("decode")}
          >
            解码
          </button>
        </div>
        {mode === "encode" && (
          <label className="conv-check">
            <input type="checkbox" checked={urlSafe} onChange={(e) => setUrlSafe(e.target.checked)} />
            URL-safe 变体
          </label>
        )}
      </div>

      <div className="conv-io">
        <div className="conv-io-col">
          <label className="conv-io-label">输入（{mode === "encode" ? "文本" : "Base64"}）</label>
          <CodeArea value={input} onChange={setInput} placeholder={mode === "encode" ? "要编码的文本" : "要解码的 Base64"} />
        </div>
        <div className="conv-io-col">
          <div className="conv-io-labelrow">
            <label className="conv-io-label">输出（{mode === "encode" ? "Base64" : "文本"}）</label>
            <CopyButton text={result.ok ? result.value ?? "" : ""} />
          </div>
          <CodeArea value={result.ok ? result.value ?? "" : ""} readOnly />
        </div>
      </div>
      <ErrorBar error={result.ok ? null : result.error} />
    </ConverterFrame>
  );
}
