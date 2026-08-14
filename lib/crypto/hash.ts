import { createHash } from "node:crypto";
import {
  CryptoResult,
  InputEncoding,
  OutputEncoding,
  decodeInput,
  encodeOutput,
  err,
  ok,
} from "./types";
import { readableError } from "./errors";

/**
 * 摘要计算。
 *
 * 走服务端 node:crypto 而非浏览器 SubtleCrypto：后者不支持 MD5，
 * 而对接遗留系统时 MD5 恰是最高频的需求。
 */

export type HashAlgorithm = "md5" | "sha1" | "sha256" | "sha512";

export const HASH_ALGORITHMS: HashAlgorithm[] = ["md5", "sha1", "sha256", "sha512"];

export interface HashParams {
  algorithm: HashAlgorithm;
  input: string;
  inputEncoding: InputEncoding;
  outputEncoding: OutputEncoding;
}

/** 计算摘要，返回按 outputEncoding 呈现的结果。空输入按合法处理（空串有确定摘要）。 */
export function hash(params: HashParams): CryptoResult<string> {
  const { algorithm, input, inputEncoding, outputEncoding } = params;
  if (!HASH_ALGORITHMS.includes(algorithm)) {
    return err(`不受支持的摘要算法：${algorithm}`);
  }

  const decoded = decodeInput(input, inputEncoding, "输入");
  if (!decoded.ok) return err(decoded.error!);

  try {
    const digest = createHash(algorithm).update(decoded.value!).digest();
    return ok(encodeOutput(digest, outputEncoding));
  } catch (e) {
    return err(readableError(e, "摘要计算失败"));
  }
}

/**
 * 十六进制小写摘要的便捷封装。
 *
 * 供 /api/signature 复用——该接口的签名规则固定为
 * md5(时间戳 + appId + appSecret) 转小写，收编到此处后 MD5 只有一份实现。
 */
export function hashHex(algorithm: HashAlgorithm, text: string): CryptoResult<string> {
  const r = hash({ algorithm, input: text, inputEncoding: "utf8", outputEncoding: "hex" });
  return r.ok ? ok(r.value!.toLowerCase()) : r;
}
