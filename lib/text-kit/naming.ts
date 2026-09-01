/**
 * 命名风格转换：一份分词器 + 八个重组器。
 *
 * 不实现「风格 A → 风格 B」的两两转换（八种风格是 56 个函数，且「怎么切词」
 * 这件事会被写 56 遍，规则必然漂移）。任意输入先归一化为词数组，再按目标
 * 风格重组，新增一种风格只需加一个重组器。
 *
 * 分词规则见 SPLIT_RULES，每一条都有对应单测锁死。
 */

export type NamingStyle =
  | "upper"
  | "lower"
  | "title"
  | "camel"
  | "pascal"
  | "snake"
  | "kebab"
  | "constant";

export const NAMING_STYLES: readonly { value: NamingStyle; label: string }[] = [
  { value: "camel", label: "camelCase" },
  { value: "pascal", label: "PascalCase" },
  { value: "snake", label: "snake_case" },
  { value: "kebab", label: "kebab-case" },
  { value: "constant", label: "CONSTANT_CASE" },
  { value: "upper", label: "UPPER" },
  { value: "lower", label: "lower" },
  { value: "title", label: "Title" },
] as const;

/** 分词规则说明，同时用于面板上的文案——让用户知道工具是怎么切的。 */
export const SPLIT_RULES: readonly { rule: string; input: string; output: string }[] = [
  { rule: "按显式分隔符切分（_ - 空格 .）", input: "foo_bar-baz qux", output: "foo bar baz qux" },
  { rule: "小写→大写边界切分", input: "fooBarBaz", output: "foo Bar Baz" },
  { rule: "连续大写后接小写时，在最后一个大写前切分", input: "HTTPServer", output: "HTTP Server" },
  { rule: "字母后紧跟数字不切分", input: "address1", output: "address1" },
  { rule: "数字后接大写字母切分", input: "user2Name", output: "user2 Name" },
  { rule: "连续分隔符产生的空词丢弃", input: "foo__bar", output: "foo bar" },
  { rule: "混合形式按以上规则叠加", input: "foo_barBaz", output: "foo bar Baz" },
] as const;

const isUpper = (c: string) => c >= "A" && c <= "Z";
const isLower = (c: string) => c >= "a" && c <= "z";
const isDigit = (c: string) => c >= "0" && c <= "9";

/**
 * 唯一一份分词器：把任意命名形式切成词数组。
 *
 * 「字母后紧跟数字不切分」是刻意的：address1 / line2 / md5 这类命名极其常见，
 * 切开会得到 address_1、md_5，与主流工具和人的直觉都不符。而 user2Name 里
 * 数字后面的大写 N 已经构成独立的词边界信号，所以那里要切。
 */
export function splitWords(input: string): string[] {
  const words: string[] = [];

  for (const chunk of input.split(/[_\-.\s]+/)) {
    if (chunk === "") continue; // 连续分隔符产生的空词丢弃

    let start = 0;
    for (let i = 1; i < chunk.length; i += 1) {
      const prev = chunk[i - 1];
      const cur = chunk[i];
      const next = chunk[i + 1];

      const lowerToUpper = isLower(prev) && isUpper(cur);
      const digitToUpper = isDigit(prev) && isUpper(cur);
      const acronymEnd = isUpper(prev) && isUpper(cur) && next !== undefined && isLower(next);

      if (lowerToUpper || digitToUpper || acronymEnd) {
        words.push(chunk.slice(start, i));
        start = i;
      }
    }
    words.push(chunk.slice(start));
  }

  return words.filter((w) => w !== "");
}

const lc = (w: string) => w.toLowerCase();
const capitalize = (w: string) => (w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w);

/** 八个重组器，全部消费 splitWords 的输出，各自不再切词。 */
const JOINERS: Record<NamingStyle, (words: string[]) => string> = {
  upper: (w) => w.map((x) => x.toUpperCase()).join(" "),
  lower: (w) => w.map(lc).join(" "),
  title: (w) => w.map(capitalize).join(" "),
  camel: (w) => w.map((x, i) => (i === 0 ? lc(x) : capitalize(x))).join(""),
  pascal: (w) => w.map(capitalize).join(""),
  snake: (w) => w.map(lc).join("_"),
  kebab: (w) => w.map(lc).join("-"),
  constant: (w) => w.map((x) => x.toUpperCase()).join("_"),
};

/** 转换单个标识符；无可分词内容时原样返回（如空行）。 */
export function convertNaming(input: string, style: NamingStyle): string {
  const words = splitWords(input);
  if (words.length === 0) return input;
  return JOINERS[style](words);
}

/** 逐行批量转换；行数与顺序保持不变。 */
export function convertNamingLines(lines: string[], style: NamingStyle): string[] {
  return lines.map((l) => convertNaming(l, style));
}
