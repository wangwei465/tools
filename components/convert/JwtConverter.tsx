"use client";

import { useMemo, useState } from "react";
import { decodeJwt } from "@/lib/convert/jwt";
import { CodeArea, CopyButton, ErrorBar, ConverterFrame } from "./shared";

/** JWT 解析——解码 header / payload 展示，不校验签名。 */
export function JwtConverter() {
  const [input, setInput] = useState("");

  const result = useMemo(() => (input.trim() ? decodeJwt(input) : null), [input]);

  return (
    <ConverterFrame
      title="JWT 解析"
      desc="解码 header 与 payload。仅供查看，不校验签名。"
    >
      {/* 安全提示：显著标注未验签 */}
      <div className="conv-notice">⚠ 本工具仅解码展示，<strong>不校验签名</strong>，解析结果不代表 token 合法有效。</div>

      <div className="conv-field">
        <label className="conv-io-label">JWT</label>
        <textarea
          className="conv-textarea"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjMifQ.signature"
        />
      </div>

      <ErrorBar error={result && !result.ok ? result.error : null} />

      {result?.ok && (
        <div className="conv-io">
          <div className="conv-io-col">
            <div className="conv-io-labelrow">
              <label className="conv-io-label">Header</label>
              <CopyButton text={result.value!.header} />
            </div>
            <CodeArea value={result.value!.header} readOnly jsonMode minHeight="140px" />
          </div>
          <div className="conv-io-col">
            <div className="conv-io-labelrow">
              <label className="conv-io-label">Payload</label>
              <CopyButton text={result.value!.payload} />
            </div>
            <CodeArea value={result.value!.payload} readOnly jsonMode minHeight="140px" />
          </div>
        </div>
      )}
    </ConverterFrame>
  );
}
