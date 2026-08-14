import { createCipheriv, createDecipheriv } from "node:crypto";
import {
  CryptoResult,
  InputEncoding,
  OutputEncoding,
  decodeInput,
  decodeUtf8,
  encodeOutput,
  err,
  ok,
} from "./types";
import { readableError } from "./errors";

/**
 * AES 对称加解密：CBC / ECB / GCM 三种模式。
 *
 * 设计要点：
 * - 密钥、IV、密文、认证标签的编码全部由调用方显式指定，不做自动嗅探
 * - GCM 的认证标签作为独立字段进出，不做"密文尾部拼接标签"这类隐式约定——
 *   隐式拼接一旦与对端系统的约定不一致，排查成本极高
 * - 密钥/IV 字节长度在调用 node:crypto 之前校验，错误信息带上期望值与实际值
 */

export type AesMode = "cbc" | "ecb" | "gcm";
export type AesBits = 128 | 192 | 256;

export const AES_MODES: AesMode[] = ["gcm", "cbc", "ecb"];
export const AES_BITS: AesBits[] = [128, 192, 256];

/** GCM 的 IV 推荐 12 字节（96 位），这是 NIST SP 800-38D 的标准取值。 */
const GCM_IV_BYTES = 12;
/** CBC 的 IV 恒为一个分组，即 16 字节。 */
const CBC_IV_BYTES = 16;

export interface SymmetricCommon {
  bits: AesBits;
  mode: AesMode;
  key: string;
  keyEncoding: InputEncoding;
  /** ECB 模式不使用 */
  iv?: string;
  ivEncoding?: InputEncoding;
}

export interface EncryptParams extends SymmetricCommon {
  plaintext: string;
  plaintextEncoding: InputEncoding;
  /** 密文与认证标签的呈现编码 */
  outputEncoding: OutputEncoding;
}

export interface EncryptOutput {
  ciphertext: string;
  /** 仅 GCM 模式有值 */
  authTag?: string;
}

export interface DecryptParams extends SymmetricCommon {
  ciphertext: string;
  ciphertextEncoding: InputEncoding;
  /** 仅 GCM 模式需要 */
  authTag?: string;
  authTagEncoding?: InputEncoding;
}

/** 校验并解出密钥字节。 */
function resolveKey(params: SymmetricCommon): CryptoResult<Buffer> {
  if (!params.key) return err("密钥不能为空");
  const decoded = decodeInput(params.key, params.keyEncoding, "密钥");
  if (!decoded.ok) return err(decoded.error!);

  const expected = params.bits / 8;
  const actual = decoded.value!.length;
  if (actual !== expected) {
    return err(`AES-${params.bits} 需要 ${expected} 字节密钥，当前 ${actual} 字节`);
  }
  return ok(decoded.value!);
}

/** 校验并解出 IV 字节；ECB 模式返回 null 表示不需要 IV。 */
function resolveIv(params: SymmetricCommon): CryptoResult<Buffer | null> {
  if (params.mode === "ecb") return ok(null);

  const raw = params.iv ?? "";
  if (!raw) return err("该模式需要提供 IV");
  const decoded = decodeInput(raw, params.ivEncoding ?? "hex", "IV");
  if (!decoded.ok) return err(decoded.error!);

  const actual = decoded.value!.length;
  if (params.mode === "cbc" && actual !== CBC_IV_BYTES) {
    return err(`CBC 模式需要 ${CBC_IV_BYTES} 字节 IV，当前 ${actual} 字节`);
  }
  // GCM 允许非 12 字节 IV，但会触发额外的 GHASH 派生且与多数对端实现不兼容，故收紧
  if (params.mode === "gcm" && actual !== GCM_IV_BYTES) {
    return err(`GCM 模式需要 ${GCM_IV_BYTES} 字节 IV，当前 ${actual} 字节`);
  }
  return ok(decoded.value!);
}

function cipherName(bits: AesBits, mode: AesMode): string {
  return `aes-${bits}-${mode}`;
}

/** 加密。GCM 模式额外返回独立的认证标签。 */
export function encrypt(params: EncryptParams): CryptoResult<EncryptOutput> {
  const key = resolveKey(params);
  if (!key.ok) return err(key.error!);
  const iv = resolveIv(params);
  if (!iv.ok) return err(iv.error!);

  const plain = decodeInput(params.plaintext, params.plaintextEncoding, "明文");
  if (!plain.ok) return err(plain.error!);

  try {
    // ECB 无 IV，Node 要求此处传 null
    const cipher = createCipheriv(
      cipherName(params.bits, params.mode),
      key.value!,
      iv.value ?? null
    );
    const encrypted = Buffer.concat([cipher.update(plain.value!), cipher.final()]);

    const output: EncryptOutput = {
      ciphertext: encodeOutput(encrypted, params.outputEncoding),
    };
    if (params.mode === "gcm") {
      // 必须在 final() 之后取，否则标签未生成
      output.authTag = encodeOutput(
        (cipher as unknown as { getAuthTag(): Buffer }).getAuthTag(),
        params.outputEncoding
      );
    }
    return ok(output);
  } catch (e) {
    return err(readableError(e, "加密失败"));
  }
}

/** 解密，输出 UTF-8 明文。密钥或标签不对时给出可读原因而非 OpenSSL 原文。 */
export function decrypt(params: DecryptParams): CryptoResult<string> {
  const key = resolveKey(params);
  if (!key.ok) return err(key.error!);
  const iv = resolveIv(params);
  if (!iv.ok) return err(iv.error!);

  const cipherBytes = decodeInput(params.ciphertext, params.ciphertextEncoding, "密文");
  if (!cipherBytes.ok) return err(cipherBytes.error!);

  let tagBytes: Buffer | null = null;
  if (params.mode === "gcm") {
    if (!params.authTag) return err("GCM 模式解密需要提供认证标签");
    const decodedTag = decodeInput(params.authTag, params.authTagEncoding ?? "hex", "认证标签");
    if (!decodedTag.ok) return err(decodedTag.error!);
    tagBytes = decodedTag.value!;
  }

  try {
    const decipher = createDecipheriv(
      cipherName(params.bits, params.mode),
      key.value!,
      iv.value ?? null
    );
    if (tagBytes) {
      // 必须在 update() 之前设置，否则 final() 无从校验
      (decipher as unknown as { setAuthTag(t: Buffer): void }).setAuthTag(tagBytes);
    }
    const decrypted = Buffer.concat([decipher.update(cipherBytes.value!), decipher.final()]);
    return decodeUtf8(decrypted);
  } catch (e) {
    return err(readableError(e, "解密失败"));
  }
}
