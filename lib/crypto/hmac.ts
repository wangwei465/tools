import { createHmac } from "node:crypto";
import {
  CryptoResult,
  InputEncoding,
  OutputEncoding,
  decodeInput,
  encodeOutput,
  err,
  ok,
} from "./types";
import { HASH_ALGORITHMS, HashAlgorithm } from "./hash";
import { readableError } from "./errors";

/** HMAC 计算，摘要算法与哈希面板保持同一组。 */

export interface HmacParams {
  algorithm: HashAlgorithm;
  /** 消息内容 */
  input: string;
  inputEncoding: InputEncoding;
  key: string;
  keyEncoding: InputEncoding;
  outputEncoding: OutputEncoding;
}

export function hmac(params: HmacParams): CryptoResult<string> {
  const { algorithm, input, inputEncoding, key, keyEncoding, outputEncoding } = params;
  if (!HASH_ALGORITHMS.includes(algorithm)) {
    return err(`不受支持的摘要算法：${algorithm}`);
  }
  // 空密钥在 node:crypto 中是合法的，但几乎总是用户漏填而非本意，故前置拦截
  if (!key) return err("密钥不能为空");

  const decodedKey = decodeInput(key, keyEncoding, "密钥");
  if (!decodedKey.ok) return err(decodedKey.error!);

  const decodedInput = decodeInput(input, inputEncoding, "消息");
  if (!decodedInput.ok) return err(decodedInput.error!);

  try {
    const mac = createHmac(algorithm, decodedKey.value!).update(decodedInput.value!).digest();
    return ok(encodeOutput(mac, outputEncoding));
  } catch (e) {
    return err(readableError(e, "HMAC 计算失败"));
  }
}
