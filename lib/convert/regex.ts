import { ConvertResult, ok, err, errMessage } from "./result";

/**
 * 正则测试器核心。
 *
 * 构造 RegExp(pattern, flags)，在测试文本中收集匹配区间与捕获分组，供 UI 高亮。
 * 护栏：限制测试文本长度与匹配数量上限，避免灾难性回溯 / 海量匹配卡死界面。
 * 仅当 flags 含 'g' 时收集全部匹配，否则只取首个匹配（与 String.match 语义一致）。
 */

/** 测试文本长度上限 */
export const MAX_TEXT_LENGTH = 100_000;
/** 匹配数量上限 */
export const MAX_MATCHES = 10_000;

export interface RegexMatch {
  /** 匹配在文本中的起始下标 */
  start: number;
  /** 匹配在文本中的结束下标（不含） */
  end: number;
  /** 完整匹配文本 */
  match: string;
  /** 捕获分组（不含整体匹配），undefined 表示该分组未参与匹配 */
  groups: (string | undefined)[];
}

export interface RegexResult {
  matches: RegexMatch[];
  /** 是否因达到上限而截断 */
  truncated: boolean;
  /** flags 未含 g，仅返回首个匹配 */
  singleMatch: boolean;
}

export function testRegex(pattern: string, flags: string, text: string): ConvertResult<RegexResult> {
  if (!pattern) return err("请输入正则表达式");
  if (text.length > MAX_TEXT_LENGTH) {
    return err(`测试文本过长（上限 ${MAX_TEXT_LENGTH} 字符），请缩短后再试`);
  }

  let re: RegExp;
  try {
    re = new RegExp(pattern, flags);
  } catch (e) {
    return err(`非法正则：${errMessage(e)}`);
  }

  const matches: RegexMatch[] = [];
  const global = flags.includes("g");
  let truncated = false;

  try {
    if (global) {
      for (const m of text.matchAll(re)) {
        if (matches.length >= MAX_MATCHES) {
          truncated = true;
          break;
        }
        matches.push(toMatch(m));
        // 零宽匹配防死循环：matchAll 已内部推进 lastIndex，此处无需手动处理
      }
    } else {
      const m = re.exec(text);
      if (m) matches.push(toMatch(m));
    }
  } catch (e) {
    return err(`匹配执行失败：${errMessage(e)}`);
  }

  return ok<RegexResult>({ matches, truncated, singleMatch: !global });
}

function toMatch(m: RegExpMatchArray | RegExpExecArray): RegexMatch {
  const full = m[0];
  const start = m.index ?? 0;
  return {
    start,
    end: start + full.length,
    match: full,
    groups: m.slice(1),
  };
}
