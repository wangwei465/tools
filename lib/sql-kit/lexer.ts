/**
 * SQL 文本分段器。
 *
 * 参数填充要「跳过字符串与注释里的 ?」，压缩要「只折叠代码段的空白、
 * 保留字符串原样」——两者需要的是同一件事：认出哪一段是代码、哪一段是
 * 字符串、哪一段是注释。故在此实现一次，供两边消费。
 *
 * 这不是完整的 SQL 词法分析，只识别会影响上述两个用途的三类区段。
 */

export type SegmentType = "code" | "string" | "comment";

/** 半开区间 [start, end)。 */
export interface Segment {
  type: SegmentType;
  start: number;
  end: number;
}

/**
 * 把 SQL 切成代码 / 字符串 / 注释三类区段。
 *
 * 字符串识别 '...'、"..."、`...`，其中 '' 与 \' 均视为转义（反引号内不认
 * 反斜杠转义，与 MySQL 一致）；注释识别 -- 到行尾与 块注释。
 * 未闭合的字符串或块注释延伸到文本末尾——宁可整段当字符串，也不要把
 * 后面的内容误判成可填充的代码。
 */
export function segments(sql: string): Segment[] {
  const out: Segment[] = [];
  let i = 0;
  let codeStart = 0;

  const flushCode = (end: number) => {
    if (end > codeStart) out.push({ type: "code", start: codeStart, end });
  };

  while (i < sql.length) {
    const ch = sql[i];
    const next = sql[i + 1];

    // 行注释：不含结尾换行，换行留给后续代码段以保留断行
    if (ch === "-" && next === "-") {
      flushCode(i);
      const nl = sql.indexOf("\n", i);
      const end = nl === -1 ? sql.length : nl;
      out.push({ type: "comment", start: i, end });
      i = end;
      codeStart = i;
      continue;
    }

    // 块注释
    if (ch === "/" && next === "*") {
      flushCode(i);
      const closing = sql.indexOf("*/", i + 2);
      const end = closing === -1 ? sql.length : closing + 2;
      out.push({ type: "comment", start: i, end });
      i = end;
      codeStart = i;
      continue;
    }

    // 字符串 / 引用标识符
    if (ch === "'" || ch === '"' || ch === "`") {
      flushCode(i);
      const quote = ch;
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === "\\" && quote !== "`") {
          j += 2;
          continue;
        }
        if (sql[j] === quote) {
          if (sql[j + 1] === quote) {
            j += 2; // '' 形式的转义
            continue;
          }
          j += 1;
          break;
        }
        j += 1;
      }
      const end = Math.min(j, sql.length);
      out.push({ type: "string", start: i, end });
      i = end;
      codeStart = i;
      continue;
    }

    i += 1;
  }

  flushCode(sql.length);
  return out;
}
