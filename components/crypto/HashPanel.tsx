"use client";

import { useState } from "react";
import {
  CopyButton,
  ErrorBar,
  HASH_OPTIONS,
  INPUT_ENCODINGS,
  InputEncoding,
  OUTPUT_ENCODINGS,
  OutputEncoding,
  PanelFrame,
  RunButton,
  Select,
  TextField,
  callCrypto,
  EncodingSelect,
} from "./shared";

type HashAlgorithm = "md5" | "sha1" | "sha256" | "sha512";

/** 哈希面板：四种摘要算法，输入与输出编码均显式选择。 */
export function HashPanel() {
  const [algorithm, setAlgorithm] = useState<HashAlgorithm>("sha256");
  const [inputEncoding, setInputEncoding] = useState<InputEncoding>("utf8");
  const [outputEncoding, setOutputEncoding] = useState<OutputEncoding>("hex");
  const [input, setInput] = useState("");
  const [result, setResult] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    const r = await callCrypto({
      op: "hash",
      algorithm,
      input,
      inputEncoding,
      outputEncoding,
    });
    setBusy(false);
    if (r.ok) {
      setResult(r.value as string);
      setError(null);
    } else {
      setResult("");
      setError(r.error!);
    }
  };

  return (
    <PanelFrame title="哈希" desc="计算文本或二进制数据的摘要值。">
      <div className="crypto-toolbar">
        <Select
          label="算法"
          value={algorithm}
          onChange={setAlgorithm}
          options={HASH_OPTIONS}
        />
        <label className="crypto-inline-field">
          <span>输入编码</span>
          <EncodingSelect
            value={inputEncoding}
            onChange={setInputEncoding}
            options={INPUT_ENCODINGS}
          />
        </label>
        <label className="crypto-inline-field">
          <span>输出编码</span>
          <EncodingSelect
            value={outputEncoding}
            onChange={setOutputEncoding}
            options={OUTPUT_ENCODINGS}
          />
        </label>
        <RunButton onClick={run} busy={busy} label="计算" />
      </div>

      <TextField
        label="输入"
        value={input}
        onChange={setInput}
        placeholder="待计算摘要的内容"
      />

      <ErrorBar error={error} />

      <TextField
        label="摘要结果"
        value={result}
        readOnly
        minHeight="70px"
        actions={<CopyButton text={result} />}
      />
    </PanelFrame>
  );
}
