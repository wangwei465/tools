import { ConvertResult, ok, err, errMessage } from "./result";

/**
 * URL 编解码。
 *
 * 区分两级：
 * - component：encodeURIComponent / decodeURIComponent，转义 & = ? # 等分隔符，
 *   适合编码单个查询参数值。
 * - full：encodeURI / decodeURI，保留 URL 结构分隔符，适合编码整条 URL。
 */
export type UrlScope = "component" | "full";

export function encodeUrl(input: string, scope: UrlScope): ConvertResult {
  try {
    const fn = scope === "component" ? encodeURIComponent : encodeURI;
    return ok(fn(input));
  } catch (e) {
    return err(`编码失败：${errMessage(e)}`);
  }
}

export function decodeUrl(input: string, scope: UrlScope): ConvertResult {
  if (!input) return err("请输入内容");
  try {
    const fn = scope === "component" ? decodeURIComponent : decodeURI;
    return ok(fn(input));
  } catch (e) {
    // decodeURIComponent 对非法 %XX 序列抛 URIError
    return err(`解码失败：非法转义序列（${errMessage(e)}）`);
  }
}
