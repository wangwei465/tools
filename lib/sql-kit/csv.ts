import { SqlResult, ok, err } from "./result";

/**
 * CSV 解析（RFC4180 子集）。
 *
 * 只覆盖 INSERT 生成实际会遇到的四种情况：分隔符切分、双引号包裹、
 * `""` 转义、引号内的换行。不做类型推断（那是 insert.ts 的事），
 * 也不引入解析库——四十行代码换一个依赖不划算。
 */

export const DELIMITERS = [
  { value: ",", label: "逗号" },
  { value: "\t", label: "制表符" },
  { value: ";", label: "分号" },
  { value: "|", label: "竖线" },
] as const;

export interface CsvOptions {
  delimiter: string;
  /** 首行是否为表头；否则列名按 col1、col2 生成 */
  hasHeader: boolean;
}

export interface CsvTable {
  headers: string[];
  rows: string[][];
}

/** 切成二维数组；不处理表头语义。 */
function parseRows(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  /** 当前字段是否由引号开头——只有开头的引号才是包裹符 */
  let fieldStarted = false;
  let i = 0;

  while (i < text.length) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }

    if (ch === '"' && !fieldStarted) {
      inQuotes = true;
      fieldStarted = true;
      i += 1;
      continue;
    }

    if (ch === delimiter) {
      row.push(field);
      field = "";
      fieldStarted = false;
      i += 1;
      continue;
    }

    if (ch === "\r") {
      i += 1;
      continue;
    }

    if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      fieldStarted = false;
      i += 1;
      continue;
    }

    field += ch;
    fieldStarted = true;
    i += 1;
  }

  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

/** 解析 CSV 为表头 + 数据行；列数与表头不一致时报错并指出行号。 */
export function parseCsv(text: string, options: CsvOptions): SqlResult<CsvTable> {
  if (!text.trim()) return err("请输入 CSV 内容");

  const all = parseRows(text, options.delimiter).filter(
    (r) => !(r.length === 1 && r[0].trim() === "")
  );
  if (all.length === 0) return err("没有解析到任何数据行");

  let headers: string[];
  let rows: string[][];

  if (options.hasHeader) {
    headers = all[0].map((h) => h.trim());
    rows = all.slice(1);
    if (rows.length === 0) return err("只有表头，没有数据行");
    if (headers.some((h) => h === "")) return err("表头中存在空列名");
  } else {
    headers = all[0].map((_, i) => `col${i + 1}`);
    rows = all;
  }

  for (let i = 0; i < rows.length; i += 1) {
    if (rows[i].length !== headers.length) {
      const lineNo = options.hasHeader ? i + 2 : i + 1;
      return err(
        `第 ${lineNo} 行有 ${rows[i].length} 列，与${options.hasHeader ? "表头" : "首行"}的 ${headers.length} 列不一致`
      );
    }
  }

  return ok<CsvTable>({ headers, rows });
}
