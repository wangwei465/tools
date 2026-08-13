/**
 * 编码转换工具的统一结果类型。
 *
 * 所有转换纯函数返回 { ok, value?, error? }，与 lib/compare 的 parseJson 风格一致：
 * 成功走 value、失败走 error，调用方（组件层）据此渲染输出或红色错误条，
 * 转换逻辑不抛异常给 UI。
 */
export interface ConvertResult<T = string> {
  ok: boolean;
  value?: T;
  error?: string;
}

export function ok<T>(value: T): ConvertResult<T> {
  return { ok: true, value };
}

export function err<T = string>(error: string): ConvertResult<T> {
  return { ok: false, error };
}

/** 从 unknown 异常中提取可读 message。 */
export function errMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}
