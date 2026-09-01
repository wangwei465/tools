/**
 * SQL 语句分类（纯函数，不依赖网络与数据库连接）。
 *
 * 本变更的核心难点：ES 的 method+path 与 Mongo 的 op+filter 都是结构化的，
 * 能靠枚举判定操作性质；SQL 是自由文本，不能。这里采取「剥离干扰 + 词法判定」
 * 而非引入 SQL 解析器——解析器的方言覆盖永远滞后于数据库本身，一条合法但
 * 解析器不认识的语句会被判成「解析失败」，而排查工具最不能接受的回答就是
 * 「你这条 SQL 我解析不了，所以不给跑」（design.md 决策二）。
 *
 * 词法判定的失败方向是相反的：可能把某条刁钻语句判得过宽。这个方向的风险由
 * 只读模式下的数据库只读事务兜底（design.md 决策三），故本模块的职责是
 * 「提前给出可读提示」，不是最后一道防线。
 *
 * 剥离步骤不是可选的：不先剥离的话 `/* 注释 *​/ DELETE FROM t` 会被判成只读，
 * `SELECT '; DROP TABLE x'` 会被判成多语句。
 */
import { segments } from "@/lib/sql-kit/lexer";
import type { OperationClass } from "./safety";

/** 只读语句的首关键字。 */
const READ_KEYWORDS = new Set(["SELECT", "SHOW", "EXPLAIN", "DESCRIBE", "DESC"]);

/** 普通写语句的首关键字。 */
const WRITE_KEYWORDS = new Set(["INSERT", "UPDATE", "DELETE", "REPLACE", "MERGE"]);

/** 危险语句的首关键字：结构变更与权限变更，任何模式下都需二次确认。 */
const DANGEROUS_KEYWORDS = new Set([
  "DROP",
  "TRUNCATE",
  "ALTER",
  "RENAME",
  "CREATE",
  "GRANT",
  "REVOKE",
]);

/** 不带 WHERE 时升级为危险的语句。 */
const NEEDS_WHERE = new Set(["UPDATE", "DELETE"]);

/**
 * 带写意图的行锁子句：`SELECT` 本身只读，加上这些子句后会取锁并阻塞其他事务，
 * 且在数据库的只读事务里会被直接拒绝，故判为写并给出解释性文案。
 */
const LOCKING_CLAUSES = ["FOR UPDATE", "FOR SHARE", "FOR NO KEY UPDATE", "LOCK IN SHARE MODE"];

/** `EXPLAIN` 的选项词：跳过后才能拿到被解释的真实语句。 */
const EXPLAIN_OPTIONS = new Set([
  "ANALYZE",
  "ANALYSE",
  "VERBOSE",
  "COSTS",
  "SETTINGS",
  "BUFFERS",
  "WAL",
  "TIMING",
  "SUMMARY",
  "FORMAT",
  "TEXT",
  "XML",
  "JSON",
  "YAML",
  "ON",
  "OFF",
  "TRUE",
  "FALSE",
]);

/* ─── 剥离与记号化 ────────────────────────────────────────── */

/**
 * 把注释与字符串字面量（含带引号的标识符）替换为等长空格。
 *
 * 等长是刻意的：剥离结果与原文下标一一对应，令 LIMIT 注入能在剥离文本上
 * 定位、再落到原始 SQL 上改写，无需第二套位置映射。故必须按 UTF-16 码元切分
 * （`split("")` 而非 `[...sql]`）——后者按码点切，一个 emoji 会少算一格，
 * 之后所有下标都会错位。
 */
export function stripSqlNoise(sql: string): string {
  const chars = sql.split("");

  for (const seg of segments(sql)) {
    if (seg.type === "code") continue;
    blank(chars, seg.start, seg.end);
  }

  blankHashComments(chars);
  return chars.join("");
}

/** 抹平区间内的非换行字符（换行留着：行号在报错定位里有用，且不影响按词扫描）。 */
function blank(chars: string[], start: number, end: number): void {
  for (let i = start; i < end; i += 1) {
    if (chars[i] !== "\n") chars[i] = " ";
  }
}

/**
 * 抹平 MySQL 的 `#` 行注释。
 *
 * 共享分段器刻意不认 `#`——PG 的 `#>` / `#>>` 是 JSON 运算符，当成注释会让
 * sql-kit 的压缩静默改坏语句。但在分类这一侧，误伤方向是反的：把 `#>` 之后
 * 当注释只会让语句被判得更保守（少认出 WHERE、落到未知关键字的写兜底），
 * 而漏认 `# SELECT\nDROP TABLE t` 则会放行一条 DDL。故这里认。
 *
 * 此时字符串与其他注释已被抹平，残留的 `#` 必然在代码段中。
 */
function blankHashComments(chars: string[]): void {
  for (let i = 0; i < chars.length; i += 1) {
    if (chars[i] !== "#") continue;
    let end = i;
    while (end < chars.length && chars[end] !== "\n") end += 1;
    blank(chars, i, end);
    i = end;
  }
}

/** 剥离后的一个词记号。 */
export interface SqlToken {
  /** 大写后的词，用于关键字比对。 */
  word: string;
  /** 原文中的词，保留大小写——PG 的标识符大小写敏感，回显时不能改写用户写的名字。 */
  raw: string;
  /** 所在括号层级，0 为顶层。 */
  depth: number;
  /** 在原始 SQL 中的起始下标（剥离等长，故下标通用）。 */
  start: number;
  /** 在原始 SQL 中的结束下标（半开）。 */
  end: number;
}

const WORD_START = /[A-Za-z_]/;
const WORD_BODY = /[A-Za-z0-9_$]/;

/** 扫描剥离文本中的词记号并记录括号层级。 */
function tokenize(stripped: string): SqlToken[] {
  const out: SqlToken[] = [];
  let depth = 0;
  let i = 0;

  while (i < stripped.length) {
    const ch = stripped[i];
    if (ch === "(") {
      depth += 1;
      i += 1;
      continue;
    }
    if (ch === ")") {
      depth = Math.max(0, depth - 1);
      i += 1;
      continue;
    }
    if (WORD_START.test(ch)) {
      let j = i + 1;
      while (j < stripped.length && WORD_BODY.test(stripped[j])) j += 1;
      // 剥离只抹平注释与字符串，代码段字符原样保留，故这里切到的就是原文
      const raw = stripped.slice(i, j);
      out.push({ word: raw.toUpperCase(), raw, depth, start: i, end: j });
      i = j;
      continue;
    }
    i += 1;
  }

  return out;
}

/**
 * 一次性分析结果：分类与 LIMIT 注入判定共用，避免各自重复剥离与扫描。
 */
export interface SqlShape {
  /** 剥离注释与字面量后的文本，长度与原文一致。 */
  stripped: string;
  /** 剥离后的语句条数（结尾分号不产生空语句）。 */
  statementCount: number;
  /** 首个关键字（大写）；无法识别时为空串。 */
  keyword: string;
  /** 全部词记号（含层级与下标）。 */
  tokens: SqlToken[];
}

/** 剥离 + 分句 + 记号化。 */
export function analyzeSql(sql: string): SqlShape {
  const stripped = stripSqlNoise(sql);
  const statementCount = stripped
    .split(";")
    .filter((s) => s.trim().length > 0).length;
  const tokens = tokenize(stripped);
  return { stripped, statementCount, keyword: tokens[0]?.word ?? "", tokens };
}

/* ─── 多语句检测 ──────────────────────────────────────────── */

/**
 * 多语句检测：剥离后按分号切分，多于一条即拒绝。
 *
 * 不做「只执行第一条」这类猜测——`SELECT 1; DROP TABLE t` 在 PG 的简单查询协议下
 * 两条都会执行，截取第一条只是把事故换了个形状。返回可读原因，单条时返回 null。
 */
export function rejectMultiStatement(sql: string): string | null {
  const { statementCount } = analyzeSql(sql);
  if (statementCount <= 1) return null;
  return `检测到 ${statementCount} 条语句，一次只能执行一条：请删掉分号后多余的语句再执行`;
}

/* ─── 语句分类 ────────────────────────────────────────────── */

const READONLY: OperationClass = { write: false, dangerous: false };

/** 顶层（括号外）是否出现某个词。 */
function hasTopWord(tokens: SqlToken[], word: string): boolean {
  return tokens.some((t) => t.depth === 0 && t.word === word);
}

/** 任意层级是否出现某个词。 */
function hasAnyWord(tokens: SqlToken[], word: string): boolean {
  return tokens.some((t) => t.word === word);
}

/** 顶层是否出现某个多词子句（如 `FOR UPDATE`）。 */
function matchedLockingClause(tokens: SqlToken[]): string | null {
  const top = tokens.filter((t) => t.depth === 0).map((t) => t.word);
  for (const clause of LOCKING_CLAUSES) {
    const words = clause.split(" ");
    for (let i = 0; i + words.length <= top.length; i += 1) {
      if (words.every((w, k) => top[i + k] === w)) return clause;
    }
  }
  return null;
}

/**
 * 判定 SQL 语句性质。
 *
 * - `SELECT` / `SHOW` / `EXPLAIN` / `DESCRIBE` 只读；`EXPLAIN` 按被解释的语句递归判定
 *   （`EXPLAIN ANALYZE DELETE …` 在 PG 上会真的删，不能一律当只读）
 * - `WITH` 按其中出现的最重的动作判定（PG 允许数据修改型 CTE，
 *   `WITH d AS (DELETE … RETURNING *) SELECT * FROM d` 的顶层关键字是 SELECT 却会删数据）
 * - `UPDATE` / `DELETE` 不带顶层 WHERE 时升级为危险，与 Mongo 侧空过滤条件同一模式
 * - DDL 与权限变更一律危险
 * - 未收录的关键字保守按写处理（与 Mongo 侧未知操作名的兜底一致）
 */
export function classifySqlOperation(sql: string): OperationClass {
  return classifyTokens(analyzeSql(sql).tokens);
}

function classifyTokens(tokens: SqlToken[]): OperationClass {
  const keyword = tokens[0]?.word ?? "";
  if (!keyword) {
    return { write: true, dangerous: false, reason: "无法识别的语句，保守按写操作处理" };
  }

  if (DANGEROUS_KEYWORDS.has(keyword)) {
    return { write: true, dangerous: true, reason: dangerousReason(keyword, tokens) };
  }

  if (keyword === "EXPLAIN") return classifyExplain(tokens);
  if (keyword === "WITH") return classifyWith(tokens);

  if (READ_KEYWORDS.has(keyword)) {
    const locking = matchedLockingClause(tokens);
    if (locking) {
      return {
        write: true,
        dangerous: false,
        reason: `${keyword} … ${locking} 会取行锁，带写意图，只读连接下不可用`,
      };
    }
    // SELECT … INTO 在 PG 建新表、在 MySQL 写文件或变量，均非只读
    if (keyword === "SELECT" && hasTopWord(tokens, "INTO")) {
      return { write: true, dangerous: false, reason: "SELECT … INTO 会写出数据，按写操作处理" };
    }
    return READONLY;
  }

  if (NEEDS_WHERE.has(keyword) && !hasTopWord(tokens, "WHERE")) {
    return {
      write: true,
      dangerous: true,
      reason: `${keyword} 不带 WHERE 子句，将影响表内全部行`,
    };
  }

  if (WRITE_KEYWORDS.has(keyword)) {
    return { write: true, dangerous: false, reason: `${keyword} 会修改数据` };
  }

  return { write: true, dangerous: false, reason: `${keyword} 未收录，保守按写操作处理` };
}

/** 危险语句的原因文案：带上操作对象，令确认弹窗能看清动的是什么。 */
function dangerousReason(keyword: string, tokens: SqlToken[]): string {
  // 用 raw 而非 word：PG 的标识符大小写敏感，把用户的表名大写会误导
  const object = tokens
    .slice(1, 4)
    .filter((t) => t.depth === 0)
    .map((t) => t.raw)
    .join(" ");
  const target = object ? ` ${object}` : "";
  if (keyword === "DROP" || keyword === "TRUNCATE") {
    return `${keyword}${target} 会删除数据或结构，不可恢复`;
  }
  if (keyword === "GRANT" || keyword === "REVOKE") {
    return `${keyword}${target} 会变更权限`;
  }
  return `${keyword}${target} 会变更表结构`;
}

/**
 * `EXPLAIN`：跳过选项词后按被解释的语句判定。
 * PG 的 `EXPLAIN ANALYZE` 会真的执行被解释的语句，故不能因为开头是 EXPLAIN 就放行。
 */
function classifyExplain(tokens: SqlToken[]): OperationClass {
  let i = 1;
  while (i < tokens.length && EXPLAIN_OPTIONS.has(tokens[i].word)) i += 1;
  const inner = tokens.slice(i);
  if (inner.length === 0) return READONLY;

  const cls = classifyTokens(inner);
  if (!cls.write) return READONLY;
  return { ...cls, reason: `EXPLAIN 的目标语句会改动数据：${cls.reason ?? ""}`.trim() };
}

/**
 * `WITH`：按语句中出现的最重动作判定，不看顶层关键字。
 *
 * 数据修改型 CTE 的写操作藏在括号里，顶层关键字是 SELECT。这里放弃精确定位、
 * 直接扫全句关键字——宁可把只在字段别名里叫 `delete` 的查询误判为写（会被要求确认），
 * 也不能把真删数据的语句放行。字面量与注释已在剥离阶段排除，误报面比看上去小。
 */
function classifyWith(tokens: SqlToken[]): OperationClass {
  for (const kw of DANGEROUS_KEYWORDS) {
    if (hasAnyWord(tokens, kw)) {
      return { write: true, dangerous: true, reason: `CTE 中含 ${kw}，会变更结构或权限` };
    }
  }
  for (const kw of WRITE_KEYWORDS) {
    if (hasAnyWord(tokens, kw)) {
      // CTE 里的 DELETE / UPDATE 是否带 WHERE 无法可靠定位，一律按危险要求确认
      return {
        write: true,
        dangerous: true,
        reason: `CTE 中含 ${kw}，该语句会修改数据（影响范围无法从语法上界定）`,
      };
    }
  }
  const locking = matchedLockingClause(tokens);
  if (locking) {
    return {
      write: true,
      dangerous: false,
      reason: `WITH … ${locking} 会取行锁，带写意图，只读连接下不可用`,
    };
  }
  return READONLY;
}
