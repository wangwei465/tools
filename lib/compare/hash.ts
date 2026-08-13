/**
 * Hash 计算。
 *
 * - JSON 模式：对规范化后的字符串计算（见 normalize.canonicalize）。
 * - 字符串模式：对原始文本直接计算。
 *
 * 采用 SHA-256，经 Web Crypto (crypto.subtle) 完成，纯前端即可，无需后端。
 * Node 18+ 与现代浏览器均支持 globalThis.crypto.subtle。
 */

/** 将 ArrayBuffer 转为十六进制字符串。 */
function bufferToHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}

/**
 * 计算文本的 SHA-256，返回十六进制字符串。
 */
export async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", data);
  return bufferToHex(digest);
}
