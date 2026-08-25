/**
 * SQL 工具的统一结果类型。
 *
 * 结果形状与 lib/convert/result.ts、lib/crypto/types.ts 一致（成功走 value、
 * 失败走 error，纯函数不向调用方抛异常），但刻意不跨工具 import：
 * 三个工具应能各自独立演进，避免一方改动波及另一方。
 */

export interface SqlResult<T = string> {
  ok: boolean;
  value?: T;
  error?: string;
}

export function ok<T>(value: T): SqlResult<T> {
  return { ok: true, value };
}

export function err<T = string>(error: string): SqlResult<T> {
  return { ok: false, error };
}

/** 从 unknown 异常中提取可读 message。 */
export function errMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}
