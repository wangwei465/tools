/**
 * 加解密工具箱的统一结果类型与编码工具。
 *
 * 结果形状与 lib/convert/result.ts 一致（成功走 value、失败走 error，
 * 纯函数不向调用方抛异常），但刻意不跨工具 import：两个工具应能各自
 * 独立演进，避免一方改动波及另一方。
 */

export interface CryptoResult<T = string> {
  ok: boolean;
  value?: T;
  error?: string;
}

export function ok<T>(value: T): CryptoResult<T> {
  return { ok: true, value };
}

export function err<T = string>(error: string): CryptoResult<T> {
  return { ok: false, error };
}

/** 从 unknown 异常中提取可读 message。 */
export function errMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

/** 二进制输入的解读方式，由用户显式选择，不做自动嗅探。 */
export type InputEncoding = "utf8" | "hex" | "base64";
/** 二进制输出的呈现方式。 */
export type OutputEncoding = "hex" | "base64";

export const INPUT_ENCODINGS: InputEncoding[] = ["utf8", "hex", "base64"];
export const OUTPUT_ENCODINGS: OutputEncoding[] = ["hex", "base64"];

/**
 * 按显式指定的编码把文本解析为字节。
 *
 * 为何不自动嗅探：短输入下 hex 与 base64 的字符集重叠（如 "abc123"
 * 两种解读都合法），猜错会静默产出"看起来成功实则错误"的结果，
 * 这是加密工具里最危险的失败模式。故编码一律由调用方（最终是用户）指定。
 *
 * @param label 字段名，用于拼出"密钥 / IV 的编码解析失败"这类可定位的提示
 */
export function decodeInput(
  text: string,
  encoding: InputEncoding,
  label = "输入"
): CryptoResult<Buffer> {
  if (encoding === "utf8") {
    return ok(Buffer.from(text, "utf8"));
  }

  // hex 与 base64 允许输入含空白（粘贴的密钥常带换行），先剔除
  const compact = text.replace(/\s+/g, "");

  if (encoding === "hex") {
    if (!/^[0-9a-fA-F]*$/.test(compact)) {
      return err(`${label}的编码解析失败：hex 中包含非十六进制字符`);
    }
    if (compact.length % 2 !== 0) {
      return err(`${label}的编码解析失败：hex 长度必须为偶数，当前 ${compact.length} 个字符`);
    }
    return ok(Buffer.from(compact, "hex"));
  }

  // base64：Buffer.from 对非法字符是静默忽略而非报错，故先自行校验字符集与长度
  const normalized = compact.replace(/-/g, "+").replace(/_/g, "/");
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(normalized)) {
    return err(`${label}的编码解析失败：base64 中包含无效字符`);
  }
  if (normalized.replace(/=+$/, "").length % 4 === 1) {
    return err(`${label}的编码解析失败：base64 长度不合法`);
  }
  return ok(Buffer.from(normalized, "base64"));
}

/** 按指定编码呈现字节。 */
export function encodeOutput(buf: Buffer, encoding: OutputEncoding): string {
  return buf.toString(encoding);
}

/** 把字节按 UTF-8 解码为文本；非法字节序列回报错误而非静默替换。 */
export function decodeUtf8(buf: Buffer): CryptoResult<string> {
  try {
    return ok(new TextDecoder("utf-8", { fatal: true }).decode(buf));
  } catch {
    return err("结果不是合法的 UTF-8 文本，可能是密钥或参数不正确");
  }
}
