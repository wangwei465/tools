import { TextResult, ok, err, errMessage } from "./result";

/**
 * 批量替换：字面量与正则两种模式。
 *
 * 本面板只做「应用」——输出替换后的完整文本与替换次数，不做匹配高亮、
 * 捕获组表格这类调试视图：那是「编码转换」的正则测试面板的职责。
 * 边界按用途切而不按技术切，虽然底层都是 RegExp。
 */

export type ReplaceMode = "literal" | "regex";

export interface ReplaceResult {
  text: string;
  count: number;
}

/** 转义字面量中的正则元字符，使其能安全地走同一条 RegExp 路径。 */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * 执行替换。
 *
 * 正则模式支持替换内容中的捕获组引用（`$1`、`$<name>`）；非法正则前置捕获
 * 为可读错误，不让 UI 崩溃。
 */
export function replaceText(
  source: string,
  pattern: string,
  replacement: string,
  options: { mode: ReplaceMode; ignoreCase?: boolean; multiline?: boolean }
): TextResult<ReplaceResult> {
  if (pattern === "") return err<ReplaceResult>("请输入要匹配的内容");

  let flags = "g";
  if (options.ignoreCase) flags += "i";
  if (options.multiline) flags += "m";

  let re: RegExp;
  try {
    re = new RegExp(options.mode === "regex" ? pattern : escapeRegex(pattern), flags);
  } catch (e) {
    return err<ReplaceResult>(`正则表达式非法：${errMessage(e)}`);
  }

  // 字面量模式下替换内容里的 $ 不应被当作捕获组引用，先转义
  const target = options.mode === "literal" ? replacement.replace(/\$/g, "$$$$") : replacement;

  let count: number;
  let text: string;
  try {
    count = (source.match(re) ?? []).length;
    text = source.replace(re, target);
  } catch (e) {
    return err<ReplaceResult>(`替换失败：${errMessage(e)}`);
  }

  return ok<ReplaceResult>({ text, count });
}
