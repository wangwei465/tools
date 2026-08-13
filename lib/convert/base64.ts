import { ConvertResult, ok, err, errMessage } from "./result";

/**
 * Base64 编解码，UTF-8 安全。
 *
 * btoa/atob 仅处理 Latin-1，直接编中文会抛错。故走
 * 文本 → TextEncoder(字节) → 二进制串 → btoa（编码）
 * atob → 二进制串 → 字节 → TextDecoder(文本)（解码）
 * 的链路。URL-safe 变体在标准结果上做 +/ → -_ 与去/补填充。
 */

/** 字节数组 → Latin-1 二进制字符串（供 btoa 消费）。 */
function bytesToBinary(bytes: Uint8Array): string {
  let binary = "";
  // 分块避免超大输入触发调用栈上限（apply 每块 8KB）
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return binary;
}

/** 文本 → Base64。urlSafe 为 true 时输出 URL-safe 变体（-_ 且去除 = 填充）。 */
export function encodeBase64(input: string, urlSafe = false): ConvertResult {
  try {
    const bytes = new TextEncoder().encode(input);
    let b64 = btoa(bytesToBinary(bytes));
    if (urlSafe) {
      b64 = b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    }
    return ok(b64);
  } catch (e) {
    return err(`编码失败：${errMessage(e)}`);
  }
}

/** Base64 → 文本。自动识别标准与 URL-safe（补齐填充后统一按标准解码）。 */
export function decodeBase64(input: string): ConvertResult {
  const trimmed = input.trim();
  if (!trimmed) return err("请输入 Base64");
  // 兼容 URL-safe：还原字符集并补齐 = 填充到 4 的倍数
  let normalized = trimmed.replace(/-/g, "+").replace(/_/g, "/");
  const pad = normalized.length % 4;
  if (pad === 2) normalized += "==";
  else if (pad === 3) normalized += "=";
  else if (pad === 1) return err("非法 Base64：长度不合法");

  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(normalized)) {
    return err("非法 Base64：包含无效字符");
  }
  try {
    const binary = atob(normalized);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    // fatal 让非法 UTF-8 字节序列抛错而非静默替换，以便回报错误
    return ok(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch (e) {
    return err(`解码失败：${errMessage(e)}`);
  }
}
