/**
 * JSON 规范化（计算层）。
 *
 * 用于 hash 与 diff 的输入准备，与"格式化展示"完全分离：
 * - 对象 key 递归排序
 * - 数组保持顺序敏感（不排序）
 * - 压缩无意义空白（通过 JSON.stringify 无缩进实现）
 *
 * 关键推论：两侧 JSON 若仅 key 顺序或空白不同、值相同，规范化后字符串相等，
 * 因此 hash 相等、判定为一致。
 */

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

/**
 * 递归地对对象 key 排序，数组保持原顺序。
 * 返回一个新的、key 有序的结构，可安全用于 JSON.stringify。
 */
export function sortKeysDeep(value: JsonValue): JsonValue {
  if (Array.isArray(value)) {
    // 数组顺序敏感：仅递归元素，不重排。
    return value.map((item) => sortKeysDeep(item));
  }
  if (value !== null && typeof value === "object") {
    const sorted: { [key: string]: JsonValue } = {};
    for (const key of Object.keys(value).sort()) {
      sorted[key] = sortKeysDeep(value[key]);
    }
    return sorted;
  }
  return value;
}

/**
 * 将任意 JSON 值规范化为紧凑、key 有序的字符串。
 * 该字符串是 hash 的输入。
 */
export function canonicalize(value: JsonValue): string {
  return JSON.stringify(sortKeysDeep(value));
}

export interface ParseResult {
  ok: boolean;
  value?: JsonValue;
  /** 解析失败时的错误信息 */
  error?: string;
}

/**
 * 安全解析 JSON 文本。失败时返回 ok:false 与错误信息，
 * 供"非法 JSON 暂停比对"逻辑使用。
 */
export function parseJson(text: string): ParseResult {
  const trimmed = text.trim();
  if (trimmed === "") {
    return { ok: false, error: "内容为空" };
  }
  try {
    return { ok: true, value: JSON.parse(trimmed) as JsonValue };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "无效的 JSON" };
  }
}
