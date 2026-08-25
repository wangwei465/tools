import { SqlResult, ok, err } from "./result";
import { segments } from "./lexer";

/**
 * SQL 日志参数填充。
 *
 * 核心是占位符扫描：`?` 可能出现在字符串字面量、行注释、块注释里，
 * 直接按 `?` 切分会让参数整体错位，产出「看着对、其实全错」的 SQL，
 * 比直接报错危险得多。故这里做一次轻量词法扫描，只收集真正的占位符。
 */

/** 不加引号的参数类型（数值与布尔）；其余一律按字符串加引号。 */
const BARE_TYPES = new Set([
  "integer",
  "int",
  "long",
  "short",
  "byte",
  "double",
  "float",
  "bigdecimal",
  "decimal",
  "number",
  "bigint",
  "boolean",
  "bool",
  "null",
]);

export interface SqlParam {
  /** 参数值原文 */
  raw: string;
  /** 类型标注，如 Integer / String；无标注时为空串 */
  type: string;
}

/**
 * 扫描出真正的占位符位置。
 *
 * 字符串与注释内的 `?` 由分段器排除（见 lexer.ts）。
 */
export function scanPlaceholders(sql: string): number[] {
  const positions: number[] = [];
  for (const seg of segments(sql)) {
    if (seg.type !== "code") continue;
    for (let i = seg.start; i < seg.end; i += 1) {
      if (sql[i] === "?") positions.push(i);
    }
  }
  return positions;
}

/**
 * 解析参数列表。
 *
 * 逗号既是参数分隔符，也可能出现在值里（`Parameters: a,b(String), 1(Integer)`）。
 * 判据是「一个参数以 (类型) 结尾或就是 null」——只有满足这个形状时逗号才算分隔符。
 */
export function parseParams(line: string): SqlParam[] {
  const trimmed = line.trim();
  if (!trimmed) return [];

  const parts: string[] = [];
  let buf = "";

  for (const ch of trimmed) {
    if (ch === ",") {
      const candidate = buf.trim();
      if (candidate.endsWith(")") || candidate.toLowerCase() === "null") {
        parts.push(candidate);
        buf = "";
        continue;
      }
    }
    buf += ch;
  }
  if (buf.trim()) parts.push(buf.trim());

  return parts.map<SqlParam>((part) => {
    if (part.toLowerCase() === "null") return { raw: "null", type: "null" };
    const m = part.match(/^([\s\S]*)\(([A-Za-z0-9_.$]+)\)$/);
    if (m) return { raw: m[1], type: m[2] };
    return { raw: part, type: "" };
  });
}

/** 按类型决定字面量形式：数值布尔裸写，其余加引号并转义内部单引号。 */
export function renderParam(param: SqlParam): string {
  const type = param.type.toLowerCase();
  if (type === "null" || param.raw.toLowerCase() === "null") return "null";
  if (BARE_TYPES.has(type)) return param.raw;
  return `'${param.raw.replace(/'/g, "''")}'`;
}

/** 把参数依次代入 SQL 的占位符。 */
export function fillSql(sql: string, paramsLine: string): SqlResult<string> {
  if (!sql.trim()) return err("请输入 SQL");

  const positions = scanPlaceholders(sql);
  const params = parseParams(paramsLine);

  if (positions.length !== params.length) {
    return err(
      `占位符与参数数量不一致：SQL 中有 ${positions.length} 个 ?，参数列表有 ${params.length} 个。` +
        `请检查是否漏掉参数，或 SQL 里的 ? 落在了字符串/注释中。`
    );
  }

  if (positions.length === 0) return ok(sql);

  // 从后往前替换，避免前面的替换改变后面占位符的下标
  let out = sql;
  for (let i = positions.length - 1; i >= 0; i -= 1) {
    const pos = positions[i];
    out = out.slice(0, pos) + renderParam(params[i]) + out.slice(pos + 1);
  }

  return ok(out);
}

export interface LogParts {
  sql: string;
  params: string;
}

/** 从整段 MyBatis / JDBC 日志中拆出 SQL 与参数列表。 */
export function splitLog(log: string): SqlResult<LogParts> {
  if (!log.trim()) return err("请粘贴日志内容");

  // 只跳过同行空白：\s* 会连换行一起吃掉，Preparing 行为空时
  // 会把下一行的 Parameters 内容误当成 SQL
  const sqlMatch = log.match(/Preparing:[ \t]*([^\n\r]*)/i);
  const paramMatch = log.match(/Parameters:[ \t]*([^\n\r]*)/i);

  if (!sqlMatch) return err("未找到 Preparing: 行，无法定位 SQL");

  const sql = sqlMatch[1].trim();
  if (!sql) return err("Preparing: 行为空");

  // 无参数的 SQL 日志里 Parameters: 行同样可能缺失，按空参数处理
  return ok<LogParts>({ sql, params: paramMatch ? paramMatch[1].trim() : "" });
}

/** 一步到位：从整段日志直接得到填充后的 SQL。 */
export function fillFromLog(log: string): SqlResult<string> {
  const parts = splitLog(log);
  if (!parts.ok) return err(parts.error!);
  return fillSql(parts.value!.sql, parts.value!.params);
}
