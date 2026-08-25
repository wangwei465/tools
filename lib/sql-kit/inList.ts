import { SqlResult, ok, err } from "./result";

/**
 * IN 列表生成。
 *
 * 输入通常是从 Excel、日志或查询结果里复制出来的一列值，形态很杂：
 * 可能按行、按逗号，可能本身已带引号。故切分与去引号都做得宽容一些，
 * 输出侧再统一按选项规整。
 */

/** 切分方式；auto 同时认换行、逗号、制表与分号。 */
export type SplitMode = "auto" | "newline" | "comma" | "tab" | "space";

export const SPLIT_MODES = [
  { value: "auto", label: "自动" },
  { value: "newline", label: "换行" },
  { value: "comma", label: "逗号" },
  { value: "tab", label: "制表符" },
  { value: "space", label: "空白" },
] as const;

export interface InListOptions {
  /** 输出是否加单引号 */
  quote: boolean;
  /** 去除重复值（保留首次出现的顺序） */
  dedupe: boolean;
  /** 每批数量；0 表示不分批 */
  batchSize: number;
  splitMode: SplitMode;
}

export const DEFAULT_OPTIONS: InListOptions = {
  quote: true,
  dedupe: true,
  batchSize: 0,
  splitMode: "auto",
};

export interface InListResult {
  /** 分批后的列表，每项形如 `'a','b'`；未分批时只有一项 */
  batches: string[];
  /** 规整后的值个数 */
  total: number;
  /** 因去重而移除的个数 */
  removed: number;
}

const SPLIT_PATTERN: Record<SplitMode, RegExp> = {
  auto: /[\n\r,;\t]+/,
  newline: /[\n\r]+/,
  comma: /,/,
  tab: /\t/,
  space: /\s+/,
};

/** 去掉值两端成对的引号——粘贴来的数据常常已经带了引号。 */
function stripQuotes(value: string): string {
  if (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];
    if ((first === "'" || first === '"') && first === last) return value.slice(1, -1);
  }
  return value;
}

/** 生成 IN 列表。 */
export function buildInList(input: string, options: InListOptions): SqlResult<InListResult> {
  if (!input.trim()) return err("请输入值列表");

  const { quote, dedupe, batchSize, splitMode } = options;
  if (!Number.isInteger(batchSize) || batchSize < 0) return err("每批数量必须为非负整数");

  const rawValues = input
    .split(SPLIT_PATTERN[splitMode])
    .map((v) => stripQuotes(v.trim()))
    .filter((v) => v.length > 0);

  if (rawValues.length === 0) return err("没有解析到任何有效值");

  let values = rawValues;
  let removed = 0;
  if (dedupe) {
    const seen = new Set<string>();
    values = rawValues.filter((v) => {
      if (seen.has(v)) return false;
      seen.add(v);
      return true;
    });
    removed = rawValues.length - values.length;
  }

  const render = (v: string) => (quote ? `'${v.replace(/'/g, "''")}'` : v);
  const size = batchSize > 0 ? batchSize : values.length;

  const batches: string[] = [];
  for (let i = 0; i < values.length; i += size) {
    batches.push(values.slice(i, i + size).map(render).join(","));
  }

  return ok<InListResult>({ batches, total: values.length, removed });
}
