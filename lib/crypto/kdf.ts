import { pbkdf2Sync, scryptSync } from "node:crypto";
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

/**
 * 密钥派生：PBKDF2 与 scrypt。
 *
 * 用于口令哈希与比对场景。之所以是这两个而非 bcrypt：
 * node:crypto 原生提供它们，无需引入第三方依赖。
 */

export type KdfAlgorithm = "pbkdf2" | "scrypt";

/** scrypt 的默认内存/并行参数，取 Node 自身的默认值。 */
const SCRYPT_DEFAULT_R = 8;
const SCRYPT_DEFAULT_P = 1;

export interface KdfParams {
  algorithm: KdfAlgorithm;
  password: string;
  salt: string;
  saltEncoding: InputEncoding;
  /** 派生输出字节数 */
  keyLength: number;
  /** PBKDF2 迭代次数 */
  iterations?: number;
  /** PBKDF2 摘要算法 */
  digest?: HashAlgorithm;
  /** scrypt 的 cost 参数 N，必须是大于 1 的 2 的幂 */
  cost?: number;
  outputEncoding: OutputEncoding;
}

/** 正整数校验，错误信息带上字段名与实际值便于定位。 */
function requirePositiveInt(value: unknown, label: string): CryptoResult<number> {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    return err(`${label}必须是正整数，当前为 ${String(value)}`);
  }
  return ok(value);
}

export function derive(params: KdfParams): CryptoResult<string> {
  if (!params.password) return err("口令不能为空");

  const salt = decodeInput(params.salt, params.saltEncoding, "盐值");
  if (!salt.ok) return err(salt.error!);

  const keyLength = requirePositiveInt(params.keyLength, "输出长度");
  if (!keyLength.ok) return err(keyLength.error!);

  const pwd = Buffer.from(params.password, "utf8");

  try {
    if (params.algorithm === "pbkdf2") {
      const iterations = requirePositiveInt(params.iterations, "迭代次数");
      if (!iterations.ok) return err(iterations.error!);

      const digest = params.digest ?? "sha256";
      if (!HASH_ALGORITHMS.includes(digest)) {
        return err(`不受支持的摘要算法：${digest}`);
      }
      const dk = pbkdf2Sync(pwd, salt.value!, iterations.value!, keyLength.value!, digest);
      return ok(encodeOutput(dk, params.outputEncoding));
    }

    if (params.algorithm === "scrypt") {
      const cost = requirePositiveInt(params.cost, "cost 参数");
      if (!cost.ok) return err(cost.error!);
      // Node 要求 N 为大于 1 的 2 的幂，否则抛出难以理解的底层错误，故前置拦截
      if (cost.value! < 2 || (cost.value! & (cost.value! - 1)) !== 0) {
        return err(`cost 参数必须是大于 1 的 2 的幂（如 1024、16384），当前为 ${cost.value}`);
      }
      const dk = scryptSync(pwd, salt.value!, keyLength.value!, {
        N: cost.value!,
        r: SCRYPT_DEFAULT_R,
        p: SCRYPT_DEFAULT_P,
        // 默认 maxmem 为 32MB，N 稍大即溢出，按参数放宽上限
        maxmem: 256 * 1024 * 1024,
      });
      return ok(encodeOutput(dk, params.outputEncoding));
    }

    return err(`不受支持的派生算法：${params.algorithm}`);
  } catch (e) {
    return err(readableError(e, "密钥派生失败"));
  }
}
