/**
 * 关系型数据源（MySQL / PostgreSQL）访问层。
 *
 * 与 ES/Mongo 的情形正好相反：这两者的核心概念 1:1 对齐——都有库/表/列/索引，
 * 都用 information_schema 暴露元数据，都是「发一条 SQL、回一组带列定义的行」。
 * 故抽一个窄接口 RdbDriver，两侧各实现一份，差异收敛在可枚举的少数几处：
 * schema 层级、标识符引号、表注释取法、只读事务语法、语句超时的设法。
 * （design.md 决策一：概念能 1:1 对齐时抽接口，不能对齐时只共享外壳。）
 *
 * 纯函数（LIMIT 注入判定、值序列化、目录行映射）与网络访问分离，可直接单测。
 */
import type {
  DatastoreConnection,
  RdbColumnInfo,
  RdbExecResult,
  RdbIndexInfo,
  RdbTableDetail,
  RdbTableInfo,
} from "./types";
import { analyzeSql } from "./sql-classify";
import type { OperationClass } from "./safety";

/** 裸 SELECT 注入的行数上限。 */
export const DEFAULT_ROW_LIMIT = 500;

/** 读取侧硬上限：不可改写的语句靠它兜底，超出即截断并标注。 */
export const HARD_ROW_LIMIT = 2000;

/** 语句超时：一条全表扫描不该把请求挂到天荒地老。 */
export const STATEMENT_TIMEOUT_MS = 15000;

/** 建连超时：宁可快速失败也不让请求长时间挂起（与 Mongo 侧同值）。 */
export const CONNECT_TIMEOUT_MS = 5000;

/** 二进制值的 hex 摘要长度上限（字节数），超出只留摘要。 */
const BINARY_PREVIEW_BYTES = 16;

/* ─── 驱动接口 ────────────────────────────────────────────── */

/** 执行入参：模式决定是否套只读事务，上限决定是否改写与截断。 */
export interface RdbExecOptions {
  /** 只读模式下用数据库自身的只读事务兜底（design.md 决策三）。 */
  readonly: boolean;
  /** 裸 SELECT 注入的行数上限。 */
  rowLimit: number;
  /** 读取侧硬上限。 */
  hardLimit: number;
}

/**
 * 关系型驱动的窄接口。
 * 目录统一为 database → schema → table 三级；MySQL 的 schema 恒等于 database
 * （层级折叠在实现里完成，接口不做二选一分支）。
 */
export interface RdbDriver {
  ping(conn: DatastoreConnection): Promise<{ version: string }>;
  listDatabases(conn: DatastoreConnection): Promise<string[]>;
  listSchemas(conn: DatastoreConnection, database: string): Promise<string[]>;
  listTables(
    conn: DatastoreConnection,
    database: string,
    schema: string
  ): Promise<RdbTableInfo[]>;
  describeTable(
    conn: DatastoreConnection,
    database: string,
    schema: string,
    table: string
  ): Promise<RdbTableDetail>;
  execute(
    conn: DatastoreConnection,
    sql: string,
    opts: RdbExecOptions
  ): Promise<RdbExecResult>;
}

/* ─── 连接串解析 ──────────────────────────────────────────── */

/**
 * 连接串的解析与组装实现在 types.ts：连接管理表单（客户端）也要用同一套，
 * 而本文件承载的是服务端语义。此处只做转出，令驱动侧的 import 集中在一处。
 */
export { parseRdbUri, buildRdbUri, RDB_DEFAULT_PORT } from "./types";
export type { RdbTarget } from "./types";

/* ─── LIMIT 注入（纯函数）────────────────────────────────── */

/** 已自带行数限制或不该改写的子句。 */
const LIMIT_BLOCKERS = ["LIMIT", "FETCH", "INTO", "OFFSET"];

/**
 * 是否该为这条语句注入行数上限。
 *
 * 触发条件收得很窄——单条、只读、以 SELECT 或 WITH 开头、且不含 LIMIT / FETCH /
 * OFFSET / INTO / 行锁子句。改写用户的 SQL 有侵入性，所以两件事必须同时成立：
 * 条件足够窄，且改写结果对用户完全透明（由 executedSql 回显兑现，design.md 决策五）。
 */
export function shouldInjectLimit(sql: string, cls: OperationClass): boolean {
  if (cls.write || cls.dangerous) return false;

  const { statementCount, keyword, tokens } = analyzeSql(sql);
  if (statementCount !== 1) return false;
  if (keyword !== "SELECT" && keyword !== "WITH") return false;

  const topWords = new Set(tokens.filter((t) => t.depth === 0).map((t) => t.word));
  if (LIMIT_BLOCKERS.some((w) => topWords.has(w))) return false;
  // FOR UPDATE / FOR SHARE：分类已判为写，此处兜一道，防止分类口径变动时漏掉
  if (topWords.has("FOR")) return false;

  return true;
}

/**
 * 追加行数上限。
 *
 * 落点是「最后一个非空白字符之后」，结尾分号要跳过——`SELECT * FROM t;` 直接
 * 追加会得到 `SELECT * FROM t; LIMIT 500` 这条非法语句。用剥离文本定位分号，
 * 避免把字面量里的分号当成语句结尾。
 */
export function injectLimit(sql: string, max: number): string {
  const stripped = analyzeSql(sql).stripped;

  let end = stripped.length;
  while (end > 0 && /\s/.test(stripped[end - 1])) end -= 1;
  if (end > 0 && stripped[end - 1] === ";") {
    end -= 1;
    while (end > 0 && /\s/.test(stripped[end - 1])) end -= 1;
  }

  return `${sql.slice(0, end)} LIMIT ${max}${sql.slice(end)}`;
}

/* ─── 值序列化（纯函数）──────────────────────────────────── */

/**
 * 把驱动返回的值转成「所见等于库中所存」的可读形式。
 *
 * 三个具体的坑决定了这里的取向（design.md 决策七）：
 * - 雪花 ID 这类 BIGINT 超过 2^53 转 Number 会静默丢精度，而本工具的编码转换里
 *   就有分布式 ID 解析器，丢精度会让两个工具互相打架 → 大整数一律转字符串
 * - 时间戳转成 JS Date 再渲染会引入一次时区转换，用户看到的时间和库里存的对不上
 *   → Date 保留为 ISO 文本（驱动层已尽量让其以原始字符串返回）
 * - 二进制整块塞进表格会撑爆单元格 → 只留 hex 摘要与字节长度
 *
 * null 原样保留，由 UI 区分 NULL 与空串。
 */
export function serializeRdbValue(value: unknown): unknown {
  if (value === null || value === undefined) return null;

  if (typeof value === "bigint") return value.toString();

  if (typeof value === "number") {
    // 超出安全整数范围的数值已经不可信，转字符串至少不再继续误导
    return Number.isSafeInteger(value) || !Number.isInteger(value) ? value : String(value);
  }

  if (typeof value !== "object") return value;

  if (value instanceof Date) return value.toISOString();

  if (Buffer.isBuffer(value)) return describeBinary(value);
  if (value instanceof Uint8Array) return describeBinary(Buffer.from(value));

  if (Array.isArray(value)) return value.map(serializeRdbValue);

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = serializeRdbValue(v);
  }
  return out;
}

/** 二进制：hex 摘要 + 字节长度，超长只留前若干字节。 */
function describeBinary(buf: Buffer): string {
  const head = buf.subarray(0, BINARY_PREVIEW_BYTES).toString("hex");
  const ellipsis = buf.length > BINARY_PREVIEW_BYTES ? "…" : "";
  return `0x${head}${ellipsis} (${buf.length} bytes)`;
}

/** 批量序列化结果行。 */
export function serializeRows(
  rows: Array<Record<string, unknown>>
): Array<Record<string, unknown>> {
  return rows.map((row) => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row)) out[k] = serializeRdbValue(v);
    return out;
  });
}

/* ─── 结果集列的去重与拼装（纯函数）────────────────────── */

/**
 * 把驱动给出的列名去重成可作对象键的标签。
 *
 * `SELECT a.id, b.id FROM a JOIN b` 会返回两个都叫 `id` 的列——排查里这写法很常见。
 * 直接用列名做键，后一列会覆盖前一列，看上去两列同值、实则丢了一列数据。
 * 故重名列加序号后缀，保证「列数 = 标签数」，表格里两列都在。
 */
export function uniqueColumnLabels(names: string[]): string[] {
  const used = new Set<string>();
  return names.map((raw, i) => {
    const base = raw || `column_${i + 1}`;
    if (!used.has(base)) {
      used.add(base);
      return base;
    }
    let n = 2;
    while (used.has(`${base}(${n})`)) n += 1;
    const label = `${base}(${n})`;
    used.add(label);
    return label;
  });
}

/** 把「一行一数组」的结果按去重标签拼成对象行，并逐值序列化。 */
export function zipRows(
  labels: string[],
  rows: unknown[][]
): Array<Record<string, unknown>> {
  return rows.map((row) => {
    const out: Record<string, unknown> = {};
    labels.forEach((label, i) => {
      out[label] = serializeRdbValue(row[i]);
    });
    return out;
  });
}

/* ─── 目录行映射（纯函数）────────────────────────────────── */

/** information_schema 的一行（各驱动返回的原始形态）。 */
export type MetaRow = Record<string, unknown>;

/** 取字符串列；null / undefined 归一为空串。 */
export function metaText(row: MetaRow, ...keys: string[]): string {
  for (const key of keys) {
    const v = row[key];
    if (v !== null && v !== undefined) return String(v);
  }
  return "";
}

/** 取数值列；不可解析时返回 null（区分「零行」与「未知」）。 */
export function metaNumber(row: MetaRow, ...keys: string[]): number | null {
  for (const key of keys) {
    const v = row[key];
    if (v === null || v === undefined) continue;
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

/** 把 information_schema.TABLES 风格的行映射为目录条目。 */
export function toTableInfo(row: MetaRow, viewMarker = "VIEW"): RdbTableInfo {
  const rawType = metaText(row, "table_type", "TABLE_TYPE").toUpperCase();
  return {
    name: metaText(row, "table_name", "TABLE_NAME"),
    type: rawType.includes(viewMarker) ? "view" : "table",
    rowCount: metaNumber(row, "row_count", "TABLE_ROWS"),
    comment: metaText(row, "table_comment", "TABLE_COMMENT"),
  };
}

/** 把 information_schema.COLUMNS 风格的行映射为列信息。 */
export function toColumnInfo(row: MetaRow): RdbColumnInfo {
  const nullable = metaText(row, "is_nullable", "IS_NULLABLE").toUpperCase();
  const defaultValue = row.column_default ?? row.COLUMN_DEFAULT ?? null;
  return {
    name: metaText(row, "column_name", "COLUMN_NAME"),
    dataType: metaText(row, "data_type", "COLUMN_TYPE", "DATA_TYPE"),
    nullable: nullable === "YES",
    defaultValue: defaultValue === null || defaultValue === undefined ? null : String(defaultValue),
    primaryKey: toBool(row.is_primary ?? row.IS_PRIMARY),
    comment: metaText(row, "column_comment", "COLUMN_COMMENT"),
  };
}

/** 驱动对布尔的表示各异（0/1、't'/'f'、true/false），统一收口。 */
function toBool(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") return /^(1|t|true|yes)$/i.test(value.trim());
  return false;
}

/**
 * 把「一行一列」的索引明细按索引名聚合成「一行一索引」。
 * 列顺序按各行给出的序号排序——多列索引的列序决定它能不能被某个查询用上，
 * 顺序错了这份信息就没有意义。
 */
export function aggregateIndexRows(rows: MetaRow[]): RdbIndexInfo[] {
  const byName = new Map<string, { unique: boolean; cols: Array<{ seq: number; name: string }> }>();

  for (const row of rows) {
    const name = metaText(row, "index_name", "INDEX_NAME");
    if (!name) continue;
    const entry = byName.get(name) ?? { unique: false, cols: [] };
    entry.unique = entry.unique || toBool(row.is_unique ?? row.IS_UNIQUE);
    entry.cols.push({
      seq: metaNumber(row, "seq_in_index", "SEQ_IN_INDEX") ?? entry.cols.length + 1,
      name: metaText(row, "column_name", "COLUMN_NAME"),
    });
    byName.set(name, entry);
  }

  return [...byName.entries()].map(([name, entry]) => ({
    name,
    unique: entry.unique,
    columns: entry.cols.sort((a, b) => a.seq - b.seq).map((c) => c.name),
  }));
}
