"use client";

import { useState } from "react";
import {
  BINARY_ENCODINGS,
  CopyButton,
  EncodedField,
  EncodingSelect,
  ErrorBar,
  INPUT_ENCODINGS,
  InputEncoding,
  OUTPUT_ENCODINGS,
  OutputEncoding,
  PanelFrame,
  RunButton,
  Select,
  TextField,
  WarnBar,
  callCrypto,
} from "./shared";

type AesMode = "gcm" | "cbc" | "ecb";
type Direction = "encrypt" | "decrypt";

const MODE_OPTIONS = [
  { value: "gcm" as const, label: "GCM（推荐）" },
  { value: "cbc" as const, label: "CBC" },
  { value: "ecb" as const, label: "ECB" },
];

const BITS_OPTIONS = [
  { value: 128 as const, label: "AES-128" },
  { value: 192 as const, label: "AES-192" },
  { value: 256 as const, label: "AES-256" },
];

/** 各模式对 IV 的字节要求，用于给出可操作的输入提示。 */
const IV_HINT: Record<AesMode, string> = {
  gcm: "12 字节",
  cbc: "16 字节",
  ecb: "",
};

/**
 * 对称加解密面板。
 *
 * GCM 的认证标签是独立的输入/输出字段——不与密文拼接。隐式拼接一旦
 * 与对端约定不一致，排查成本极高，显式字段让约定一目了然。
 */
export function SymmetricPanel() {
  const [direction, setDirection] = useState<Direction>("encrypt");
  const [bits, setBits] = useState<128 | 192 | 256>(256);
  const [mode, setMode] = useState<AesMode>("gcm");

  const [key, setKey] = useState("");
  const [keyEncoding, setKeyEncoding] = useState<InputEncoding>("hex");
  const [iv, setIv] = useState("");
  const [ivEncoding, setIvEncoding] = useState<InputEncoding>("hex");
  const [authTag, setAuthTag] = useState("");
  const [authTagEncoding, setAuthTagEncoding] = useState<InputEncoding>("hex");

  const [plaintext, setPlaintext] = useState("");
  const [plaintextEncoding, setPlaintextEncoding] = useState<InputEncoding>("utf8");
  const [ciphertext, setCiphertext] = useState("");
  const [ciphertextEncoding, setCiphertextEncoding] = useState<InputEncoding>("hex");
  const [outputEncoding, setOutputEncoding] = useState<OutputEncoding>("hex");

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    setError(null);

    if (direction === "encrypt") {
      const r = await callCrypto<{ ciphertext: string; authTag?: string }>({
        op: "encrypt",
        bits,
        mode,
        key,
        keyEncoding,
        iv,
        ivEncoding,
        plaintext,
        plaintextEncoding,
        outputEncoding,
      });
      setBusy(false);
      if (r.ok) {
        setCiphertext(r.value!.ciphertext);
        setCiphertextEncoding(outputEncoding);
        setAuthTag(r.value!.authTag ?? "");
        if (r.value!.authTag) setAuthTagEncoding(outputEncoding);
      } else {
        setCiphertext("");
        setAuthTag("");
        setError(r.error!);
      }
      return;
    }

    const r = await callCrypto<string>({
      op: "decrypt",
      bits,
      mode,
      key,
      keyEncoding,
      iv,
      ivEncoding,
      ciphertext,
      ciphertextEncoding,
      authTag,
      authTagEncoding,
    });
    setBusy(false);
    if (r.ok) {
      setPlaintext(r.value!);
      setPlaintextEncoding("utf8");
    } else {
      setPlaintext("");
      setError(r.error!);
    }
  };

  return (
    <PanelFrame title="对称加解密" desc="AES 加解密，支持 GCM / CBC / ECB 三种模式。">
      <div className="crypto-toolbar">
        <div className="crypto-seg">
          {(["encrypt", "decrypt"] as const).map((d) => (
            <button
              key={d}
              className={`crypto-seg-btn${direction === d ? " active" : ""}`}
              onClick={() => setDirection(d)}
            >
              {d === "encrypt" ? "加密" : "解密"}
            </button>
          ))}
        </div>
        <Select label="密钥位数" value={bits} onChange={setBits} options={BITS_OPTIONS} />
        <Select label="模式" value={mode} onChange={setMode} options={MODE_OPTIONS} />
        {direction === "encrypt" && (
          <label className="crypto-inline-field">
            <span>输出编码</span>
            <EncodingSelect
              value={outputEncoding}
              onChange={setOutputEncoding}
              options={OUTPUT_ENCODINGS}
            />
          </label>
        )}
        <RunButton onClick={run} busy={busy} label={direction === "encrypt" ? "加密" : "解密"} />
      </div>

      {mode === "ecb" && (
        <WarnBar>
          <strong>ECB 是弱模式</strong>：相同明文块产出相同密文块，会泄露数据结构。
          仅用于对接遗留系统，勿用于新设计。
        </WarnBar>
      )}

      <EncodedField
        label={`密钥（需 ${bits / 8} 字节）`}
        value={key}
        onChange={setKey}
        encoding={keyEncoding}
        onEncodingChange={setKeyEncoding}
        encodings={INPUT_ENCODINGS}
        placeholder={`AES-${bits} 密钥`}
      />

      {mode !== "ecb" && (
        <EncodedField
          label={`IV（需 ${IV_HINT[mode]}）`}
          value={iv}
          onChange={setIv}
          encoding={ivEncoding}
          onEncodingChange={setIvEncoding}
          encodings={INPUT_ENCODINGS}
          placeholder="初始化向量"
        />
      )}

      {mode === "gcm" && (
        <EncodedField
          label="认证标签"
          value={authTag}
          onChange={setAuthTag}
          encoding={authTagEncoding}
          onEncodingChange={setAuthTagEncoding}
          encodings={BINARY_ENCODINGS}
          placeholder={direction === "encrypt" ? "加密后自动填入" : "解密需提供加密时产出的标签"}
        />
      )}

      <ErrorBar error={error} />

      <div className="crypto-io">
        <div className="crypto-io-col">
          <div className="crypto-labelrow">
            <span className="crypto-label">明文</span>
            <div className="crypto-labelrow-actions">
              <EncodingSelect
                value={plaintextEncoding}
                onChange={setPlaintextEncoding}
                options={INPUT_ENCODINGS}
                title="明文编码"
              />
              <CopyButton text={plaintext} />
            </div>
          </div>
          <textarea
            className="crypto-textarea"
            value={plaintext}
            placeholder={direction === "encrypt" ? "待加密的明文" : "解密结果显示在此"}
            readOnly={direction === "decrypt"}
            onChange={(e) => setPlaintext(e.target.value)}
          />
        </div>

        <div className="crypto-io-col">
          <div className="crypto-labelrow">
            <span className="crypto-label">密文</span>
            <div className="crypto-labelrow-actions">
              <EncodingSelect
                value={ciphertextEncoding}
                onChange={setCiphertextEncoding}
                options={BINARY_ENCODINGS}
                title="密文编码"
              />
              <CopyButton text={ciphertext} />
            </div>
          </div>
          <textarea
            className="crypto-textarea"
            value={ciphertext}
            placeholder={direction === "encrypt" ? "加密结果显示在此" : "待解密的密文"}
            readOnly={direction === "encrypt"}
            onChange={(e) => setCiphertext(e.target.value)}
          />
        </div>
      </div>
    </PanelFrame>
  );
}
