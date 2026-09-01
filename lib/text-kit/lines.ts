import { TextResult, ok, err } from "./result";

/**
 * 行级文本处理。
 *
 * 全部为纯函数，失败以 TextResult 返回而非抛异常。空行的语义按操作区分：
 * 去重 / 排序 / 集合运算把每一行原样当作元素，不做 trim——用户想去空白
 * 有专门的开关，隐式 trim 会让「行首缩进」这类有意义的内容被悄悄改掉。
 */

export type SortMode = "lexical" | "numeric" | "length";

/** 按换行切分；统一处理 CRLF，并丢弃末尾换行产生的空尾行。 */
export function toLines(text: string): string[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  if (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

export function toText(lines: string[]): string {
  return lines.join("\n");
}

/** 去重，保留每行首次出现的顺序。 */
export function dedupe(lines: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of lines) {
    if (seen.has(line)) continue;
    seen.add(line);
    out.push(line);
  }
  return out;
}

/**
 * 排序：字典序 / 数值 / 行长度，可反序。
 *
 * 数值模式遇到非数值行时报错而非跳过——静默产出一个「看起来排好了」
 * 的错误顺序，比直接失败危险得多。
 */
export function sortLines(
  lines: string[],
  mode: SortMode,
  desc = false
): TextResult<string[]> {
  let sorted: string[];

  if (mode === "numeric") {
    for (let i = 0; i < lines.length; i += 1) {
      const t = lines[i].trim();
      if (t === "" || Number.isNaN(Number(t))) {
        return err<string[]>(
          `第 ${i + 1} 行「${lines[i]}」不是合法数值，无法按数值排序。请改用字典序，或先清理非数值行。`
        );
      }
    }
    sorted = [...lines].sort((a, b) => Number(a.trim()) - Number(b.trim()));
  } else if (mode === "length") {
    sorted = [...lines].sort((a, b) => a.length - b.length);
  } else {
    sorted = [...lines].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  }

  return ok(desc ? sorted.reverse() : sorted);
}

/** 移除空行（仅含空白的行也算空）。 */
export function removeEmpty(lines: string[]): string[] {
  return lines.filter((l) => l.trim() !== "");
}

/** 去各行首尾空白。 */
export function trimLines(lines: string[]): string[] {
  return lines.map((l) => l.trim());
}

/** 加前缀与后缀。 */
export function affix(lines: string[], prefix: string, suffix: string): string[] {
  if (!prefix && !suffix) return lines;
  return lines.map((l) => `${prefix}${l}${suffix}`);
}

/** 加行号，起始值可指定；序号右对齐到最宽的一个，便于阅读。 */
export function numberLines(lines: string[], start = 1, separator = ". "): string[] {
  const width = String(start + lines.length - 1).length;
  return lines.map((l, i) => `${String(start + i).padStart(width, " ")}${separator}${l}`);
}

/** 整体反转行序。 */
export function reverseLines(lines: string[]): string[] {
  return [...lines].reverse();
}

export type SetOp = "intersect" | "difference" | "union";

/** 两组文本的交集 / 差集（左减右）/ 并集；结果去重并保序。 */
export function setOperate(left: string[], right: string[], op: SetOp): string[] {
  const rightSet = new Set(right);
  if (op === "union") return dedupe([...left, ...right]);
  if (op === "intersect") return dedupe(left.filter((l) => rightSet.has(l)));
  return dedupe(left.filter((l) => !rightSet.has(l)));
}
