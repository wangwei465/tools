/**
 * 文本工具的统一结果类型。
 *
 * 结果形状与 lib/sql-kit/result.ts、lib/convert/result.ts 一致（成功走 value、
 * 失败走 error，纯函数不向调用方抛异常），但刻意不跨工具 import：
 * 各工具应能各自独立演进，避免一方改动波及另一方。
 *
 * 注意这条决策只针对「类型外壳」——二十行的类型定义复制一份成本近乎为零。
 * 真实算法（如 CSV 解析）仍只保留一份，放在不属于任何工具的 lib/shared 下。
 */

export interface TextResult<T = string> {
  ok: boolean;
  value?: T;
  error?: string;
}

export function ok<T>(value: T): TextResult<T> {
  return { ok: true, value };
}

export function err<T = string>(error: string): TextResult<T> {
  return { ok: false, error };
}

/** 从 unknown 异常中提取可读 message。 */
export function errMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}
