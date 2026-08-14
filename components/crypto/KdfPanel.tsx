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

type KdfAlgorithm = "pbkdf2" | "scrypt";
type HashAlgorithm = "md5" | "sha1" | "sha256" | "sha512";

const KDF_OPTIONS = [
  { value: "pbkdf2" as const, label: "PBKDF2" },
  { value: "scrypt" as const, label: "scrypt" },
];

/**
 * 密钥派生面板。
 *
 * 不提供 bcrypt：node:crypto 不含该算法，纳入需引第三方依赖。
 * 口令哈希场景由这两者覆盖。
 */
export function KdfPanel() {
  const [algorithm, setAlgorithm] = useState<KdfAlgorithm>("pbkdf2");
  const [password, setPassword] = useState("");
  const [salt, setSalt] = useState("");
  const [saltEncoding, setSaltEncoding] = useState<InputEncoding>("utf8");
  const [iterations, setIterations] = useState("100000");
  const [cost, setCost] = useState("16384");
  const [keyLength, setKeyLength] = useState("32");
  const [digest, setDigest] = useState<HashAlgorithm>("sha256");
  const [outputEncoding, setOutputEncoding] = useState<OutputEncoding>("hex");

  const [result, setResult] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    // 数值参数在此转为 number，非数字输入会成为 NaN 并由服务端的正整数校验拦下
    const r = await callCrypto({
      op: "kdf",
      algorithm,
      password,
      salt,
      saltEncoding,
      keyLength: Number(keyLength),
      iterations: Number(iterations),
      cost: Number(cost),
      digest,
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
    <PanelFrame title="密钥派生" desc="由口令派生固定长度的密钥，用于口令哈希与比对。">
      <div className="crypto-toolbar">
        <Select label="算法" value={algorithm} onChange={setAlgorithm} options={KDF_OPTIONS} />
        {algorithm === "pbkdf2" ? (
          <>
            <label className="crypto-inline-field">
              <span>迭代次数</span>
              <input
                className="crypto-input crypto-input-sm"
                value={iterations}
                onChange={(e) => setIterations(e.target.value)}
              />
            </label>
            <Select label="摘要" value={digest} onChange={setDigest} options={HASH_OPTIONS} />
          </>
        ) : (
          <label className="crypto-inline-field">
            <span>cost（2 的幂）</span>
            <input
              className="crypto-input crypto-input-sm"
              value={cost}
              onChange={(e) => setCost(e.target.value)}
            />
          </label>
        )}
        <label className="crypto-inline-field">
          <span>输出字节</span>
          <input
            className="crypto-input crypto-input-sm"
            value={keyLength}
            onChange={(e) => setKeyLength(e.target.value)}
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
        <RunButton onClick={run} busy={busy} label="派生" />
      </div>

      <div className="crypto-field">
        <span className="crypto-label">口令</span>
        <input
          className="crypto-input crypto-mono"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="待派生的口令"
        />
      </div>

      <EncodedField
        label="盐值"
        value={salt}
        onChange={setSalt}
        encoding={saltEncoding}
        onEncodingChange={setSaltEncoding}
        encodings={INPUT_ENCODINGS}
        placeholder="salt"
      />

      <ErrorBar error={error} />

      <TextField
        label="派生密钥"
        value={result}
        readOnly
        minHeight="70px"
        actions={<CopyButton text={result} />}
      />
    </PanelFrame>
  );
}
