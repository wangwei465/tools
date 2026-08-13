import { ConvertResult, ok, err } from "./result";

/**
 * UUID v4 生成。
 *
 * 优先用 crypto.randomUUID（安全上下文，如 localhost / https）；
 * 不可用时回退到基于 crypto.getRandomValues 的 v4 构造。
 */

/** 用 getRandomValues 构造一个 v4 UUID（回退实现）。 */
function uuidV4Fallback(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  // 按 RFC 4122 设置版本(4)与变体(10xx)位
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0"));
  return (
    hex.slice(0, 4).join("") +
    "-" +
    hex.slice(4, 6).join("") +
    "-" +
    hex.slice(6, 8).join("") +
    "-" +
    hex.slice(8, 10).join("") +
    "-" +
    hex.slice(10, 16).join("")
  );
}

function genOne(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return uuidV4Fallback();
}

/** 批量生成 count 个 v4 UUID。count 限定 1..1000。 */
export function generateUuids(count = 1): ConvertResult<string[]> {
  if (!Number.isInteger(count) || count < 1) return err("数量必须为不小于 1 的整数");
  if (count > 1000) return err("单次最多生成 1000 个");
  const list = Array.from({ length: count }, genOne);
  return ok(list);
}
