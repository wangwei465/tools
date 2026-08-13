import { ConvertResult, ok, err } from "./result";

/**
 * 时间戳 ⇔ 日期互转。
 *
 * 时间戳支持秒 / 毫秒两种精度；日期同时给出本地时区与 UTC 展示。
 */
export type TsUnit = "s" | "ms";

export interface DateView {
  /** ISO 8601（UTC，带 Z） */
  iso: string;
  /** 本地时区可读字符串 */
  local: string;
  /** UTC 可读字符串 */
  utc: string;
}

export interface TsView {
  seconds: number;
  millis: number;
}

/** 时间戳 → 日期视图。unit 指明输入是秒还是毫秒。 */
export function timestampToDate(input: string, unit: TsUnit): ConvertResult<DateView> {
  const trimmed = input.trim();
  if (!trimmed) return err("请输入时间戳");
  if (!/^-?\d+$/.test(trimmed)) return err("时间戳必须为整数");

  const num = Number(trimmed);
  if (!Number.isFinite(num)) return err("时间戳超出可表示范围");

  const millis = unit === "s" ? num * 1000 : num;
  const d = new Date(millis);
  if (Number.isNaN(d.getTime())) return err("无法解析为有效日期");

  return ok<DateView>({
    iso: d.toISOString(),
    local: d.toLocaleString(),
    utc: d.toUTCString(),
  });
}

/** 日期 → 时间戳（秒 + 毫秒）。接受 Date 可解析的字符串（ISO、常见格式）。 */
export function dateToTimestamp(input: string): ConvertResult<TsView> {
  const trimmed = input.trim();
  if (!trimmed) return err("请输入日期");

  const millis = Date.parse(trimmed);
  if (Number.isNaN(millis)) return err("无法解析该日期（建议使用 ISO 格式，如 2026-07-27T10:00:00Z）");

  return ok<TsView>({
    seconds: Math.floor(millis / 1000),
    millis,
  });
}

/** 当前时间戳（毫秒），供 UI「取当前时间」按钮使用。 */
export function nowMillis(): number {
  return Date.now();
}
