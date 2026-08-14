"use client";

import { useState } from "react";
import {
  CopyButton,
  EncodedField,
  EncodingSelect,
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
} from "./shared";

type HashAlgorithm = "md5" | "sha1" | "sha256" | "sha512";

/** HMAC 面板：带密钥的摘要，密钥编码独立选择。 */
export function HmacPanel() {
  const [algorithm, setAlgorithm] = useState<HashAlgorithm>("sha256");
  const [key, setKey] = useState("");
  const [keyEncoding, setKeyEncoding] = useState<InputEncoding>("utf8");
  const [inputEncoding, setInputEncoding] = useState<InputEncoding>("utf8");
  const [outputEncoding, setOutputEncoding] = useState<OutputEncoding>("hex");
  const [input, setInput] = useState("");
  const [result, setResult] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    const r = await callCrypto({
      op: "hmac",
      algorithm,
      key,
      keyEncoding,
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
    <PanelFrame title="HMAC" desc="以密钥参与计算的消息认证码，常用于接口签名校验。">
      <div className="crypto-toolbar">
        <Select
          label="摘要算法"
          value={algorithm}
          onChange={setAlgorithm}
          options={HASH_OPTIONS}
        />
        <label className="crypto-inline-field">
          <span>消息编码</span>
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

      <EncodedField
        label="密钥"
        value={key}
        onChange={setKey}
        encoding={keyEncoding}
        onEncodingChange={setKeyEncoding}
        encodings={INPUT_ENCODINGS}
        placeholder="HMAC 密钥"
      />

      <TextField label="消息" value={input} onChange={setInput} placeholder="待计算的消息内容" />

      <ErrorBar error={error} />

      <TextField
        label="HMAC 结果"
        value={result}
        readOnly
        minHeight="70px"
        actions={<CopyButton text={result} />}
      />
    </PanelFrame>
  );
}
