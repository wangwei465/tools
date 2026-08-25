import { CronExpressionParser } from "cron-parser";
import { ConvertResult, ok, err } from "./result";

/**
 * Cron 表达式解析。
 *
 * 执行时间的计算交给 cron-parser——day-of-month 与 day-of-week 的 OR 语义、
 * 月末与闰年边界自研极易出错。库的 API 差异（v4 parseExpression / v5
 * CronExpressionParser.parse）只在本文件的 nextTimes 里出现，UI 层不接触。
 *
 * 字段的中文描述自研：现成库多为英文，而这里只需按字段做字符串描述。
 */

/** 预览次数上限，防止一次性渲染过多行。 */
export const MAX_PREVIEW = 50;

export interface CronFieldDesc {
  /** 字段名，如「分钟」 */
  name: string;
  /** 该字段的原始表达式片段 */
  expr: string;
  /** 中文描述 */
  desc: string;
}

export interface CronNext {
  local: string;
  iso: string;
}

export interface CronView {
  /** 5 段 / 6 段；宏表达式为 0 */
  fieldCount: number;
  /** 是否为 @daily 这类预定义宏 */
  macro: boolean;
  fields: CronFieldDesc[];
  next: CronNext[];
}

const FIELD_NAMES_5 = ["分钟", "小时", "日", "月", "星期"] as const;
const FIELD_NAMES_6 = ["秒", "分钟", "小时", "日", "月", "星期"] as const;

/** 各字段的单位量词，用于拼「每 N <单位>」。 */
const FIELD_UNIT: Record<string, string> = {
  秒: "秒",
  分钟: "分钟",
  小时: "小时",
  日: "日",
  月: "月",
  星期: "星期",
};

const WEEK_NAMES = ["周日", "周一", "周二", "周三", "周四", "周五", "周六", "周日"];
const MONTH_ALIAS: Record<string, number> = {
  JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6,
  JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12,
};
const WEEK_ALIAS: Record<string, number> = {
  SUN: 0, MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6,
};

/** Quartz 扩展语法标记，用于在解析失败时给出更准确的提示。 */
const QUARTZ_CHARS = /[LW#]/i;

/** 把单个数值翻译成人话：星期与月份用名称，其余用原值。 */
function describeValue(field: string, raw: string): string {
  const upper = raw.toUpperCase();
  if (field === "星期") {
    const n = WEEK_ALIAS[upper] ?? Number(raw);
    return Number.isInteger(n) && n >= 0 && n <= 7 ? WEEK_NAMES[n] : raw;
  }
  if (field === "月") {
    const n = MONTH_ALIAS[upper] ?? Number(raw);
    return Number.isInteger(n) && n >= 1 && n <= 12 ? `${n} 月` : raw;
  }
  return raw;
}

/** 描述单个字段片段（不含逗号枚举）。 */
function describePart(field: string, part: string): string {
  const unit = FIELD_UNIT[field] ?? field;

  // 步进：*/n 或 a-b/n
  const stepMatch = part.match(/^(.+)\/(\d+)$/);
  if (stepMatch) {
    const [, base, step] = stepMatch;
    if (base === "*") return `每 ${step} ${unit}`;
    const rangeMatch = base.match(/^(\S+)-(\S+)$/);
    if (rangeMatch) {
      return `${describeValue(field, rangeMatch[1])} 到 ${describeValue(field, rangeMatch[2])} 之间每 ${step} ${unit}`;
    }
    return `自 ${describeValue(field, base)} 起每 ${step} ${unit}`;
  }

  if (part === "*") return `每${unit}`;
  if (part === "?") return "不指定";

  const rangeMatch = part.match(/^(\S+)-(\S+)$/);
  if (rangeMatch) {
    return `${describeValue(field, rangeMatch[1])} 到 ${describeValue(field, rangeMatch[2])}`;
  }

  if (QUARTZ_CHARS.test(part)) return `${part}（Quartz 扩展语法）`;

  return describeValue(field, part);
}

/** 描述一个完整字段（处理逗号枚举）。 */
function describeField(field: string, expr: string): string {
  const parts = expr.split(",").filter(Boolean);
  if (parts.length === 0) return expr;
  return parts.map((p) => describePart(field, p)).join("、");
}

/** 调用 cron-parser 求未来 count 次执行时间；库 API 只在这里出现。 */
function nextTimes(expr: string, count: number, base: Date | undefined): ConvertResult<CronNext[]> {
  try {
    const it = CronExpressionParser.parse(expr, base ? { currentDate: base } : undefined);
    const list: CronNext[] = [];
    for (let i = 0; i < count; i += 1) {
      if (!it.hasNext()) break;
      const d = it.next().toDate();
      list.push({ local: d.toLocaleString(), iso: d.toISOString() });
    }
    return ok(list);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (QUARTZ_CHARS.test(expr)) {
      return err(`表达式解析失败（${message}）。注意部分 Quartz 扩展语法（如 W）不受支持。`);
    }
    return err(`表达式解析失败：${message}`);
  }
}

/**
 * 解析 cron 表达式。
 *
 * @param expr 表达式（5 段 / 6 段 / @宏）
 * @param count 预览次数
 * @param baseTime 基准时间，留空表示当前时间
 */
export function parseCron(expr: string, count: number, baseTime?: string): ConvertResult<CronView> {
  const trimmed = expr.trim();
  if (!trimmed) return err("请输入 cron 表达式");

  if (!Number.isInteger(count) || count < 1 || count > MAX_PREVIEW) {
    return err(`预览次数需为 1 到 ${MAX_PREVIEW} 之间的整数`);
  }

  let base: Date | undefined;
  if (baseTime && baseTime.trim()) {
    const millis = Date.parse(baseTime.trim());
    if (Number.isNaN(millis)) return err("无法解析基准时间（建议使用 ISO 格式，如 2026-08-24T10:00:00）");
    base = new Date(millis);
  }

  const macro = trimmed.startsWith("@");
  const segments = trimmed.split(/\s+/);

  // 前置校验段数：cron-parser 会给 3 段表达式自动补齐高位字段并静默解析，
  // 那不是用户想要的结果，宁可在这里拦下。
  if (!macro && segments.length !== 5 && segments.length !== 6) {
    return err(`字段数为 ${segments.length}，标准 cron 应为 5 段（分 时 日 月 周）或 6 段（含秒）`);
  }

  const timesResult = nextTimes(trimmed, count, base);
  if (!timesResult.ok) return err(timesResult.error!);

  const names = macro ? [] : segments.length === 6 ? FIELD_NAMES_6 : FIELD_NAMES_5;
  const fields: CronFieldDesc[] = macro
    ? [{ name: "预定义宏", expr: trimmed, desc: `等价于对应的标准表达式（${trimmed}）` }]
    : names.map((name, i) => ({
        name,
        expr: segments[i],
        desc: describeField(name, segments[i]),
      }));

  return ok<CronView>({
    fieldCount: macro ? 0 : segments.length,
    macro,
    fields,
    next: timesResult.value!,
  });
}
