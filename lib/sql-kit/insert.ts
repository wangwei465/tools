import { SqlResult, ok, err, errMessage } from "./result";
import { parseCsv, CsvOptions } from "./csv";

/**
 * INSERT 语句生成。
 *
 * CSV 与 JSON 两个入口收敛到同一个「列名 + 行值」中间形态，再统一渲染，
 * 这样两种输出形式（每行一条 / 单条多值）只需实现一次。
 */

export type SourceFormat = "csv" | "json";
export type OutputForm = "multi" | "single";

export const SOURCE_FORMATS = [
  { value: "csv", label: "CSV" },
  { value: "json", label: "JSON 数组" },
] as const;

export const OUTPUT_FORMS = [
  { value: "multi", label: "每行一条" },
  { value: "single", label: "单条多值" },
] as const;

export interface InsertOptions extends CsvOptions {
  table: string;
  format: SourceFormat;
  output: OutputForm;
}

/**
 * CSV 的值全是字符串，需要嗅探才知道该不该加引号。
 *
 * 前导零的整数（如订单号 0012345）一律当字符串——把它当数值输出会
 * 静默丢掉前导零，改变业务含义，比多加一对引号危险得多。
 */
function isNumericLiteral(s: string): boolean {
  if (!/^-?\d+(\.\d+)?$/.test(s)) return false;
  const intPart = s.replace(/^-/, "").split(".")[0];
  if (intPart.length > 1 && intPart.startsWith("0")) return false;
  return true;
}

/** SQL 字符串字面量：加单引号并把内部单引号转义为两个。 */
function quote(s: string): string {
  return `'${s.replace(/'/g, "''")}'`;
}

/** 渲染 CSV 单元格。 */
function renderCsvValue(raw: string): string {
  const v = raw.trim();
  if (v === "") return "null";
  if (v.toLowerCase() === "null") return "null";
  if (v.toLowerCase() === "true" || v.toLowerCase() === "false") return v.toLowerCase();
  if (isNumericLiteral(v)) return v;
  return quote(raw);
}

/** 渲染 JSON 值；类型在 JSON 里是明确的，无需嗅探。 */
function renderJsonValue(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "null";
  if (typeof value === "boolean") return String(value);
  if (typeof value === "object") return quote(JSON.stringify(value));
  return quote(String(value));
}

/** 标识符包裹：含特殊字符时加反引号，避免关键字或空格导致语法错误。 */
function renderIdentifier(name: string): string {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) ? name : `\`${name.replace(/`/g, "``")}\``;
}

/** 中间形态：统一后的列名与已渲染为 SQL 字面量的行值。 */
interface Table {
  columns: string[];
  rows: string[][];
}

function fromCsv(input: string, options: InsertOptions): SqlResult<Table> {
  const parsed = parseCsv(input, options);
  if (!parsed.ok) return err(parsed.error!);
  return ok<Table>({
    columns: parsed.value!.headers,
    rows: parsed.value!.rows.map((r) => r.map(renderCsvValue)),
  });
}

function fromJson(input: string): SqlResult<Table> {
  if (!input.trim()) return err("请输入 JSON 内容");

  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch (e) {
    return err(`JSON 解析失败：${errMessage(e)}`);
  }

  if (!Array.isArray(parsed)) return err("JSON 必须是数组，当前是单个值或对象");
  if (parsed.length === 0) return err("JSON 数组为空");

  const objects: Record<string, unknown>[] = [];
  for (let i = 0; i < parsed.length; i += 1) {
    const item = parsed[i];
    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      return err(`JSON 数组第 ${i + 1} 项不是对象`);
    }
    objects.push(item as Record<string, unknown>);
  }

  // 以并集为列，某行缺失的键补 null——不同记录字段不齐是常见情况
  const columns: string[] = [];
  for (const obj of objects) {
    for (const key of Object.keys(obj)) {
      if (!columns.includes(key)) columns.push(key);
    }
  }
  if (columns.length === 0) return err("JSON 对象没有任何字段");

  return ok<Table>({
    columns,
    rows: objects.map((obj) => columns.map((c) => renderJsonValue(obj[c]))),
  });
}

/** 生成 INSERT 语句。 */
export function buildInsert(input: string, options: InsertOptions): SqlResult<string> {
  const table = options.table.trim();
  if (!table) return err("请填写表名");

  const parsed = options.format === "csv" ? fromCsv(input, options) : fromJson(input);
  if (!parsed.ok) return err(parsed.error!);

  const { columns, rows } = parsed.value!;
  const colList = columns.map(renderIdentifier).join(", ");
  const head = `INSERT INTO ${renderIdentifier(table)} (${colList}) VALUES`;

  if (options.output === "single") {
    const values = rows.map((r) => `  (${r.join(", ")})`).join(",\n");
    return ok(`${head}\n${values};`);
  }

  return ok(rows.map((r) => `${head} (${r.join(", ")});`).join("\n"));
}
