"use client";

import { useState } from "react";
import {
  BINARY_ENCODINGS,
  CopyButton,
  EncodingSelect,
  ErrorBar,
  HASH_OPTIONS,
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

type HashAlgorithm = "md5" | "sha1" | "sha256" | "sha512";
type Operation = "encrypt" | "decrypt" | "sign" | "verify";

const OP_OPTIONS: { value: Operation; label: string }[] = [
  { value: "encrypt", label: "公钥加密" },
  { value: "decrypt", label: "私钥解密" },
  { value: "sign", label: "私钥签名" },
  { value: "verify", label: "公钥验签" },
];

const ENC_PADDING = [
  { value: "oaep" as const, label: "OAEP（推荐）" },
  { value: "pkcs1" as const, label: "PKCS#1 v1.5" },
];

const SIGN_PADDING = [
  { value: "pss" as const, label: "PSS（推荐）" },
  { value: "pkcs1" as const, label: "PKCS#1 v1.5" },
];

/** 需要私钥的操作，用于决定展示哪一个密钥输入框。 */
const NEEDS_PRIVATE: Operation[] = ["decrypt", "sign"];

/**
 * 非对称面板：RSA 四种操作共用一套密钥与文本输入。
 *
 * 验签的语义特殊：不通过是正常结果而非错误，故用独立的结果条展示
 * 「通过 / 未通过」，不走红色错误条。
 */
export function AsymmetricPanel() {
  const [operation, setOperation] = useState<Operation>("encrypt");
  const [publicKeyPem, setPublicKeyPem] = useState("");
  const [privateKeyPem, setPrivateKeyPem] = useState("");
  const [padding, setPadding] = useState<"oaep" | "pkcs1">("oaep");
  const [signPadding, setSignPadding] = useState<"pss" | "pkcs1">("pss");
  const [algorithm, setAlgorithm] = useState<HashAlgorithm>("sha256");
  const [outputEncoding, setOutputEncoding] = useState<OutputEncoding>("base64");
  const [payloadEncoding, setPayloadEncoding] = useState<InputEncoding>("base64");

  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [verified, setVerified] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isLegacyPadding =
    (operation === "encrypt" || operation === "decrypt") && padding === "pkcs1";
  const isLegacySignPadding =
    (operation === "sign" || operation === "verify") && signPadding === "pkcs1";

  const run = async () => {
    setBusy(true);
    setError(null);
    setVerified(null);

    let r: { ok: boolean; value?: unknown; error?: string };
    switch (operation) {
      case "encrypt":
        r = await callCrypto({
          op: "encrypt",
          scheme: "rsa",
          publicKeyPem,
          plaintext: input,
          padding,
          oaepHash: algorithm,
          outputEncoding,
        });
        break;
      case "decrypt":
        r = await callCrypto({
          op: "decrypt",
          scheme: "rsa",
          privateKeyPem,
          ciphertext: input,
          ciphertextEncoding: payloadEncoding,
          padding,
          oaepHash: algorithm,
        });
        break;
      case "sign":
        r = await callCrypto({
          op: "sign",
          privateKeyPem,
          message: input,
          algorithm,
          padding: signPadding,
          outputEncoding,
        });
        break;
      case "verify":
        r = await callCrypto({
          op: "verify",
          publicKeyPem,
          message: input,
          signature: output,
          signatureEncoding: payloadEncoding,
          algorithm,
          padding: signPadding,
        });
        break;
    }

    setBusy(false);
    if (!r.ok) {
      setError(r.error!);
      if (operation !== "verify") setOutput("");
      return;
    }
    if (operation === "verify") {
      setVerified(r.value as boolean);
    } else {
      setOutput(r.value as string);
    }
  };

  const inputLabel =
    operation === "decrypt" ? "密文" : operation === "encrypt" ? "明文" : "消息";
  const outputLabel =
    operation === "decrypt" ? "明文" : operation === "encrypt" ? "密文" : "签名";

  return (
    <PanelFrame title="非对称（RSA）" desc="RSA 加解密与签名验签，密钥以 PEM 文本粘贴。">
      <div className="crypto-toolbar">
        <Select label="操作" value={operation} onChange={setOperation} options={OP_OPTIONS} />
        {(operation === "encrypt" || operation === "decrypt") && (
          <Select label="填充" value={padding} onChange={setPadding} options={ENC_PADDING} />
        )}
        {(operation === "sign" || operation === "verify") && (
          <Select
            label="填充"
            value={signPadding}
            onChange={setSignPadding}
            options={SIGN_PADDING}
          />
        )}
        <Select
          label={operation === "encrypt" || operation === "decrypt" ? "OAEP 摘要" : "摘要算法"}
          value={algorithm}
          onChange={setAlgorithm}
          options={HASH_OPTIONS}
        />
        {(operation === "encrypt" || operation === "sign") && (
          <label className="crypto-inline-field">
            <span>输出编码</span>
            <EncodingSelect
              value={outputEncoding}
              onChange={setOutputEncoding}
              options={OUTPUT_ENCODINGS}
            />
          </label>
        )}
        {(operation === "decrypt" || operation === "verify") && (
          <label className="crypto-inline-field">
            <span>{operation === "decrypt" ? "密文编码" : "签名编码"}</span>
            <EncodingSelect
              value={payloadEncoding}
              onChange={setPayloadEncoding}
              options={BINARY_ENCODINGS}
            />
          </label>
        )}
        <RunButton
          onClick={run}
          busy={busy}
          label={OP_OPTIONS.find((o) => o.value === operation)!.label}
        />
      </div>

      {(isLegacyPadding || isLegacySignPadding) && (
        <WarnBar>
          <strong>PKCS#1 v1.5 是已知的弱填充方案</strong>：仅用于对接遗留系统，
          新设计请使用 {operation === "sign" || operation === "verify" ? "PSS" : "OAEP"}。
        </WarnBar>
      )}

      {NEEDS_PRIVATE.includes(operation) ? (
        <TextField
          label="私钥 PEM"
          value={privateKeyPem}
          onChange={setPrivateKeyPem}
          placeholder={"-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"}
          minHeight="110px"
        />
      ) : (
        <TextField
          label="公钥 PEM"
          value={publicKeyPem}
          onChange={setPublicKeyPem}
          placeholder={"-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----"}
          minHeight="110px"
        />
      )}

      <ErrorBar error={error} />

      {verified !== null && (
        <div className={`crypto-verdict${verified ? " pass" : " fail"}`}>
          {verified ? "✓ 验签通过" : "✗ 验签未通过：签名与消息或公钥不匹配"}
        </div>
      )}

      <TextField label={inputLabel} value={input} onChange={setInput} minHeight="90px" />

      <TextField
        label={operation === "verify" ? "签名" : outputLabel}
        value={output}
        onChange={operation === "verify" ? setOutput : undefined}
        readOnly={operation !== "verify"}
        minHeight="90px"
        placeholder={operation === "verify" ? "待验证的签名" : undefined}
        actions={<CopyButton text={output} />}
      />
    </PanelFrame>
  );
}
