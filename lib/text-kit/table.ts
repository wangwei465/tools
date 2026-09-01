import { TextResult, ok, err, errMessage } from "./result";
import { parseCsvTable, CsvOptions } from "@/lib/shared/csv";
import { checkDepth } from "./limits";

/**
 * 表格格式互转：CSV/TSV ⇄ JSON 数组 ⇄ Markdown 表格。
 *
 * 一律走「源格式 → 中枢模型 → 目标格式」，不实现任何格式间的直连转换：
 * 新增一种格式只需加一个 parse 与一个 stringify，且所有格式共享同一套
 * 「表头缺失怎么办、单元格数量不齐怎么办」的处理，不会出现
 * 「CSV→JSON 补空串、Markdown→JSON 却报错」这种不一致。
 */

/** 中枢模型：二维表格。 */
export interface Table {
  header: string[];
  rows: string[][];
}

export type TableFormat = "csv" | "json" | "markdown";

export const TABLE_FORMATS: readonly { value: TableFormat; label: string }[] = [
  { value: "csv", label: "CSV / TSV" },
  { value: "json", label: "JSON 数组" },
  { value: "markdown", label: "Markdown 表格" },
] as const;

export interface TableOptions {
  /** CSV/TSV 侧的分隔符 */
  delimiter: string;
  /** CSV/TSV 侧首行是否为表头 */
  hasHeader: boolean;
}

/** 把 JSON 值序列化为单元格文本：嵌套对象与数组走紧凑 JSON，不递归展开。 */
function cellOf(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

// ── parse：源格式 → 中枢 ────────────────────────────────────────

function parseCsvSource(text: string, options: TableOptions): Table {
  const opts: CsvOptions = { delimiter: options.delimiter, hasHeader: options.hasHeader };
  const t = parseCsvTable(text, opts);
  return { header: t.headers, rows: t.rows };
}

function parseJsonSource(text: string): Table {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    throw new Error(`JSON 解析失败：${errMessage(e)}`);
  }

  const depth = checkDepth(parsed);
  if (!depth.ok) throw new Error(depth.error!);

  if (!Array.isArray(parsed)) throw new Error("JSON 需为对象数组，例如 [{ \"id\": 1 }]");
  if (parsed.length === 0) throw new Error("JSON 数组为空，没有可转换的数据");

  // 列取所有对象字段的并集，与 datastore 的结果表格同一取向：
  // 面对异构数据用并集而非首元素，缺失字段留空
  const header: string[] = [];
  for (const item of parsed) {
    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      throw new Error("JSON 数组的元素需为对象");
    }
    for (const key of Object.keys(item as Record<string, unknown>)) {
      if (!header.includes(key)) header.push(key);
    }
  }

  const rows = (parsed as Record<string, unknown>[]).map((item) =>
    header.map((k) => cellOf(item[k]))
  );
  return { header, rows };
}

/** 拆分 Markdown 表格的一行：容忍首尾竖线的有无，支持 \| 转义。 */
function splitMarkdownRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|") && !s.endsWith("\\|")) s = s.slice(0, -1);

  const cells: string[] = [];
  let cur = "";
  for (let i = 0; i < s.length; i += 1) {
    if (s[i] === "\\" && s[i + 1] === "|") {
      cur += "|";
      i += 1;
      continue;
    }
    if (s[i] === "|") {
      cells.push(cur.trim());
      cur = "";
      continue;
    }
    cur += s[i];
  }
  cells.push(cur.trim());
  return cells;
}

const isAlignRow = (cells: string[]) =>
  cells.length > 0 && cells.every((c) => /^:?-{1,}:?$/.test(c.trim()));

function parseMarkdownSource(text: string): Table {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l !== "");
  if (lines.length === 0) throw new Error("请输入 Markdown 表格内容");

  const header = splitMarkdownRow(lines[0]);
  if (header.length < 1 || header.every((h) => h === "")) {
    throw new Error("无法解析出表头，请确认首行是以竖线分隔的表格行");
  }

  // 对齐行可有可无——宽松策略，缺失时把第二行也当数据行
  let bodyStart = 1;
  if (lines.length > 1 && isAlignRow(splitMarkdownRow(lines[1]))) bodyStart = 2;

  const raw = lines.slice(bodyStart).map(splitMarkdownRow);
  // 单元格数量不齐时按最长行补空，不报错也不错位
  const width = Math.max(header.length, ...raw.map((r) => r.length), 1);
  const pad = (cells: string[]) => {
    const out = [...cells];
    while (out.length < width) out.push("");
    return out.slice(0, width);
  };

  return { header: pad(header), rows: raw.map(pad) };
}

// ── stringify：中枢 → 目标格式 ─────────────────────────────────

/** 需要引号包裹的场景：含分隔符、引号、换行。 */
function csvCell(value: string, delimiter: string): string {
  if (value.includes(delimiter) || value.includes('"') || /[\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function stringifyCsv(table: Table, options: TableOptions): string {
  const d = options.delimiter;
  const lines: string[] = [];
  if (options.hasHeader) lines.push(table.header.map((h) => csvCell(h, d)).join(d));
  for (const row of table.rows) lines.push(row.map((c) => csvCell(c, d)).join(d));
  return lines.join("\n");
}

function stringifyJson(table: Table): string {
  const objects = table.rows.map((row) => {
    const obj: Record<string, string> = {};
    table.header.forEach((h, i) => {
      obj[h] = row[i] ?? "";
    });
    return obj;
  });
  return JSON.stringify(objects, null, 2);
}

function stringifyMarkdown(table: Table): string {
  const esc = (c: string) => c.replace(/\|/g, "\\|").replace(/[\r\n]+/g, " ");
  const line = (cells: string[]) => `| ${cells.map(esc).join(" | ")} |`;
  const lines = [line(table.header), `| ${table.header.map(() => "---").join(" | ")} |`];
  for (const row of table.rows) lines.push(line(row));
  return lines.join("\n");
}

// ── 对外入口 ───────────────────────────────────────────────────

/** 源文本 → 中枢模型。 */
export function parseTable(
  text: string,
  format: TableFormat,
  options: TableOptions
): TextResult<Table> {
  try {
    if (format === "csv") return ok(parseCsvSource(text, options));
    if (format === "json") return ok(parseJsonSource(text));
    return ok(parseMarkdownSource(text));
  } catch (e) {
    return err<Table>(errMessage(e));
  }
}

/** 中枢模型 → 目标文本。 */
export function stringifyTable(
  table: Table,
  format: TableFormat,
  options: TableOptions
): string {
  if (format === "csv") return stringifyCsv(table, options);
  if (format === "json") return stringifyJson(table);
  return stringifyMarkdown(table);
}

/** 源 → 中枢 → 目标；不存在任何格式间的直连路径。 */
export function convertTable(
  text: string,
  from: TableFormat,
  to: TableFormat,
  options: TableOptions
): TextResult<string> {
  const parsed = parseTable(text, from, options);
  if (!parsed.ok) return err<string>(parsed.error!);
  return ok(stringifyTable(parsed.value!, to, options));
}
