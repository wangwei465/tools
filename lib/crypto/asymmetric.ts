import {
  constants,
  createPrivateKey,
  createPublicKey,
  privateDecrypt,
  publicEncrypt,
  sign as nodeSign,
  verify as nodeVerify,
} from "node:crypto";
import {
  CryptoResult,
  OutputEncoding,
  decodeInput,
  decodeUtf8,
  encodeOutput,
  err,
  ok,
} from "./types";
import { HashAlgorithm, HASH_ALGORITHMS } from "./hash";
import { readableError } from "./errors";

/**
 * RSA 加解密与签名验签。
 *
 * 填充方案的取舍：加密默认 OAEP、签名默认 PSS（现代方案），
 * 同时保留 PKCS#1 v1.5 供对接遗留系统——后者是已知的弱方案，
 * 由 UI 侧承担风险提示，此处只负责如实执行。
 */

export type RsaPadding = "oaep" | "pkcs1";
export type RsaSignPadding = "pss" | "pkcs1";

export interface RsaEncryptParams {
  publicKeyPem: string;
  plaintext: string;
  padding: RsaPadding;
  /** OAEP 的摘要算法，pkcs1 时忽略 */
  oaepHash?: HashAlgorithm;
  outputEncoding: OutputEncoding;
}

export interface RsaDecryptParams {
  privateKeyPem: string;
  ciphertext: string;
  ciphertextEncoding: "hex" | "base64";
  padding: RsaPadding;
  oaepHash?: HashAlgorithm;
}

export interface RsaSignParams {
  privateKeyPem: string;
  message: string;
  algorithm: HashAlgorithm;
  padding: RsaSignPadding;
  outputEncoding: OutputEncoding;
}

export interface RsaVerifyParams {
  publicKeyPem: string;
  message: string;
  signature: string;
  signatureEncoding: "hex" | "base64";
  algorithm: HashAlgorithm;
  padding: RsaSignPadding;
}

function encryptPaddingFlag(p: RsaPadding): number {
  return p === "oaep" ? constants.RSA_PKCS1_OAEP_PADDING : constants.RSA_PKCS1_PADDING;
}

function signPaddingFlag(p: RsaSignPadding): number {
  return p === "pss" ? constants.RSA_PKCS1_PSS_PADDING : constants.RSA_PKCS1_PADDING;
}

/** 解析公钥 PEM。私钥 PEM 也可导出公钥，故一并容许。 */
function parsePublicKey(pem: string) {
  const trimmed = pem.trim();
  if (!trimmed) throw new Error("no start line");
  if (trimmed.includes("PRIVATE KEY")) {
    return createPublicKey(createPrivateKey(trimmed));
  }
  return createPublicKey(trimmed);
}

export function rsaEncrypt(params: RsaEncryptParams): CryptoResult<string> {
  const plain = decodeInput(params.plaintext, "utf8", "明文");
  if (!plain.ok) return err(plain.error!);

  try {
    const key = parsePublicKey(params.publicKeyPem);
    const encrypted = publicEncrypt(
      {
        key,
        padding: encryptPaddingFlag(params.padding),
        ...(params.padding === "oaep"
          ? { oaepHash: params.oaepHash ?? "sha256" }
          : {}),
      },
      plain.value!
    );
    return ok(encodeOutput(encrypted, params.outputEncoding));
  } catch (e) {
    return err(readableError(e, "RSA 加密失败"));
  }
}

export function rsaDecrypt(params: RsaDecryptParams): CryptoResult<string> {
  const cipherBytes = decodeInput(params.ciphertext, params.ciphertextEncoding, "密文");
  if (!cipherBytes.ok) return err(cipherBytes.error!);

  try {
    const key = createPrivateKey(params.privateKeyPem.trim());
    const decrypted = privateDecrypt(
      {
        key,
        padding: encryptPaddingFlag(params.padding),
        ...(params.padding === "oaep"
          ? { oaepHash: params.oaepHash ?? "sha256" }
          : {}),
      },
      cipherBytes.value!
    );
    return decodeUtf8(decrypted);
  } catch (e) {
    return err(readableError(e, "RSA 解密失败"));
  }
}

export function rsaSign(params: RsaSignParams): CryptoResult<string> {
  if (!HASH_ALGORITHMS.includes(params.algorithm)) {
    return err(`不受支持的摘要算法：${params.algorithm}`);
  }
  try {
    const key = createPrivateKey(params.privateKeyPem.trim());
    const signature = nodeSign(params.algorithm, Buffer.from(params.message, "utf8"), {
      key,
      padding: signPaddingFlag(params.padding),
    });
    return ok(encodeOutput(signature, params.outputEncoding));
  } catch (e) {
    return err(readableError(e, "签名失败"));
  }
}

/**
 * 验签。
 *
 * 注意语义：签名不匹配是**正常的业务结果**而非异常，故返回
 * ok(false) 而非 err(...)——UI 据此展示"未通过"而不是红色错误条。
 * 只有密钥无法解析、编码非法这类真正的失败才走 err。
 */
export function rsaVerify(params: RsaVerifyParams): CryptoResult<boolean> {
  if (!HASH_ALGORITHMS.includes(params.algorithm)) {
    return err(`不受支持的摘要算法：${params.algorithm}`);
  }
  const sigBytes = decodeInput(params.signature, params.signatureEncoding, "签名");
  if (!sigBytes.ok) return err(sigBytes.error!);

  try {
    const key = parsePublicKey(params.publicKeyPem);
    const passed = nodeVerify(
      params.algorithm,
      Buffer.from(params.message, "utf8"),
      { key, padding: signPaddingFlag(params.padding) },
      sigBytes.value!
    );
    return ok(passed);
  } catch (e) {
    return err(readableError(e, "验签失败"));
  }
}
