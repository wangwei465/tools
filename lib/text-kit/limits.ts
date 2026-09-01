import { TextResult, ok, err } from "./result";

/**
 * 处理规模的硬上限。
 *
 * 所有计算同步跑在主线程上，没有上限的话一份几十兆的文本或一个病态嵌套的
 * JSON 会直接把标签页卡死——用户连错误提示都收不到。这里前置拒绝并说明
 * 上限值。不上 Web Worker：需要处理这种规模的场景本就该写脚本。
 */

/** 输入文本体积上限（字符数）。1M 字符约等于一份几百万行以内的日志片段。 */
export const MAX_INPUT_CHARS = 1_000_000;

/** JSON 嵌套深度上限。真实报文极少超过十几层，32 层留足余量且不会栈溢出。 */
export const MAX_JSON_DEPTH = 32;

/** 校验输入体积；超限返回带上限值的可读错误。 */
export function checkSize<T = string>(text: string): TextResult<T> | null {
  if (text.length > MAX_INPUT_CHARS) {
    return err<T>(
      `输入长度 ${text.length.toLocaleString()} 字符，超过上限 ${MAX_INPUT_CHARS.toLocaleString()} 字符。请拆分后分批处理，或改用脚本。`
    );
  }
  return null;
}

/** 校验已解析 JSON 值的嵌套深度；超限返回带上限值的可读错误。 */
export function checkDepth(value: unknown): TextResult<true> {
  const over = (v: unknown, depth: number): boolean => {
    if (depth > MAX_JSON_DEPTH) return true;
    if (Array.isArray(v)) return v.some((x) => over(x, depth + 1));
    if (v !== null && typeof v === "object") {
      return Object.values(v as Record<string, unknown>).some((x) => over(x, depth + 1));
    }
    return false;
  };
  if (over(value, 1)) {
    return err<true>(`JSON 嵌套深度超过上限 ${MAX_JSON_DEPTH} 层，已停止处理。`);
  }
  return ok(true as const);
}
