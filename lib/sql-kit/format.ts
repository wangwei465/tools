import { format } from "sql-formatter";
import { SqlResult, ok, err, errMessage } from "./result";
import { segments } from "./lexer";

/**
 * SQL 格式化与压缩。
 *
 * 美化交给 sql-formatter：要正确断行必须先做完整的词法与语法分析，
 * 自研必然在字符串、注释、方言关键字上出错。库 API 只在本文件出现。
 *
 * 压缩则自研：sql-formatter 不提供压缩，而压缩只需「折叠代码段空白、
 * 保留字符串原样、去掉注释」，用现成的分段器即可。
 */

/** 支持的方言，取 sql-formatter 中与日常最相关的几种。 */
export const DIALECTS = [
  { value: "mysql", label: "MySQL" },
  { value: "mariadb", label: "MariaDB" },
  { value: "postgresql", label: "PostgreSQL" },
  { value: "sqlite", label: "SQLite" },
  { value: "tsql", label: "SQL Server" },
  { value: "plsql", label: "Oracle" },
  { value: "hive", label: "Hive" },
  { value: "sql", label: "标准 SQL" },
] as const;

export type Dialect = (typeof DIALECTS)[number]["value"];

export const DEFAULT_DIALECT: Dialect = "mysql";

/** 美化：缩进与关键字换行。 */
export function beautify(sql: string, dialect: Dialect = DEFAULT_DIALECT): SqlResult<string> {
  if (!sql.trim()) return err("请输入 SQL");
  try {
    return ok(format(sql, { language: dialect }));
  } catch (e) {
    return err(`无法格式化（原文已保留）：${errMessage(e)}`);
  }
}

/**
 * 压缩为单行。
 *
 * 只折叠代码段中的空白——字符串字面量里的空格与换行属于数据，
 * 一并折叠会改变查询语义。注释整体移除，位置补一个空格防止词粘连。
 */
export function minify(sql: string): SqlResult<string> {
  if (!sql.trim()) return err("请输入 SQL");

  let out = "";
  for (const seg of segments(sql)) {
    const text = sql.slice(seg.start, seg.end);

    if (seg.type === "comment") {
      if (out && !out.endsWith(" ")) out += " ";
      continue;
    }

    if (seg.type === "string") {
      out += text;
      continue;
    }

    let collapsed = text.replace(/\s+/g, " ");
    if (out.endsWith(" ") && collapsed.startsWith(" ")) collapsed = collapsed.slice(1);
    out += collapsed;
  }

  return ok(out.trim());
}
