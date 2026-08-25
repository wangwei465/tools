import { ConvertResult, ok, err } from "./result";

/**
 * 分布式 ID 反解：雪花（Snowflake）ID 与 MongoDB ObjectId。
 *
 * 雪花 ID 一律走 BigInt——十进制 19 位的 ID 早已超过 Number.MAX_SAFE_INTEGER，
 * 用 Number 解析会静默丢精度，拆出来的机器位与序列号全是错的。
 */

/** 雪花 ID 的位分配；三段之和须 ≤ 63（最高位为符号位，不参与）。 */
export interface SnowflakeLayout {
  timestampBits: number;
  machineBits: number;
  sequenceBits: number;
}

/** 主流实现的默认位分配：41 位毫秒时间戳 + 10 位机器 + 12 位序列。 */
export const DEFAULT_LAYOUT: SnowflakeLayout = {
  timestampBits: 41,
  machineBits: 10,
  sequenceBits: 12,
};

/** 起始纪元预设。各家实现的纪元不同，选错只会让时间整体偏移而不报错，故需显式可选。 */
export const EPOCH_PRESETS = [
  { key: "twitter", label: "Twitter 原版（2010-11-04）", value: 1288834974657 },
  { key: "unix", label: "Unix 零点（1970-01-01）", value: 0 },
] as const;

/** ID 类型；auto 表示按输入形态自动分流。 */
export type IdKind = "auto" | "snowflake" | "objectid";

/** 时间的三种展示形式，与 datetime 转换器保持一致。 */
export interface TimeView {
  iso: string;
  local: string;
  utc: string;
}

export interface SnowflakeView {
  kind: "snowflake";
  /** 十进制原值（回显用，确认没有被精度截断） */
  id: string;
  /** 时间戳段的原始值（相对纪元的偏移） */
  timestampDelta: string;
  /** 绝对毫秒时间戳 = epoch + delta */
  millis: number;
  time: TimeView;
  machineId: string;
  sequence: string;
}

export interface ObjectIdView {
  kind: "objectid";
  id: string;
  /** 前 4 字节的秒级时间戳 */
  seconds: number;
  time: TimeView;
  /** 后 8 字节（随机值 + 计数器），仅作回显 */
  rest: string;
}

export type IdView = SnowflakeView | ObjectIdView;

/** 63 位有符号整数的十进制最大长度（9223372036854775807 共 19 位）。 */
const MAX_SNOWFLAKE_DIGITS = 19;

function toTimeView(millis: number): TimeView {
  const d = new Date(millis);
  return { iso: d.toISOString(), local: d.toLocaleString(), utc: d.toUTCString() };
}

/** 校验位分配；三段之和超过 63 位时无法用有符号 64 位整数容纳。 */
export function validateLayout(layout: SnowflakeLayout): ConvertResult<true> {
  const { timestampBits, machineBits, sequenceBits } = layout;
  for (const [name, bits] of [
    ["时间戳位", timestampBits],
    ["机器位", machineBits],
    ["序列位", sequenceBits],
  ] as const) {
    if (!Number.isInteger(bits) || bits < 0) return err(`${name}必须为非负整数`);
  }
  const total = timestampBits + machineBits + sequenceBits;
  if (total > 63) return err(`位宽之和为 ${total}，超过 63 位上限（最高位为符号位）`);
  return ok(true);
}

/** 解析雪花 ID。epoch 为起始纪元的毫秒值，layout 为位分配。 */
export function parseSnowflake(
  input: string,
  epoch: number,
  layout: SnowflakeLayout = DEFAULT_LAYOUT
): ConvertResult<SnowflakeView> {
  const trimmed = input.trim();
  if (!trimmed) return err("请输入 ID");
  if (!/^\d+$/.test(trimmed)) return err("雪花 ID 必须为十进制正整数");

  const layoutCheck = validateLayout(layout);
  if (!layoutCheck.ok) return err(layoutCheck.error!);

  if (!Number.isFinite(epoch)) return err("起始纪元必须为数字");

  const id = BigInt(trimmed);
  if (id >= 1n << 63n) return err("ID 超出 64 位有符号整数范围");

  const { timestampBits, machineBits, sequenceBits } = layout;
  const seqMask = (1n << BigInt(sequenceBits)) - 1n;
  const machineMask = (1n << BigInt(machineBits)) - 1n;
  const tsMask = (1n << BigInt(timestampBits)) - 1n;

  const sequence = id & seqMask;
  const machineId = (id >> BigInt(sequenceBits)) & machineMask;
  const timestampDelta = (id >> BigInt(sequenceBits + machineBits)) & tsMask;

  const millis = epoch + Number(timestampDelta);
  const d = new Date(millis);
  if (Number.isNaN(d.getTime())) return err("按当前纪元与位宽算出的时间无效，请检查纪元或位宽配置");

  return ok<SnowflakeView>({
    kind: "snowflake",
    id: trimmed,
    timestampDelta: timestampDelta.toString(),
    millis,
    time: toTimeView(millis),
    machineId: machineId.toString(),
    sequence: sequence.toString(),
  });
}

/** 解析 MongoDB ObjectId：24 位十六进制，前 4 字节为秒级时间戳。 */
export function parseObjectId(input: string): ConvertResult<ObjectIdView> {
  const trimmed = input.trim();
  if (!trimmed) return err("请输入 ID");
  if (!/^[0-9a-fA-F]{24}$/.test(trimmed)) return err("ObjectId 必须为 24 位十六进制字符");

  const seconds = parseInt(trimmed.slice(0, 8), 16);
  const millis = seconds * 1000;

  return ok<ObjectIdView>({
    kind: "objectid",
    id: trimmed,
    seconds,
    time: toTimeView(millis),
    rest: trimmed.slice(8),
  });
}

/**
 * 按输入形态自动分流。
 *
 * 24 位一律判为 ObjectId——雪花 ID 十进制最长 19 位（2^63-1），
 * 24 位纯数字不可能是雪花 ID，故不存在歧义。
 */
export function detectKind(input: string): Exclude<IdKind, "auto"> | null {
  const trimmed = input.trim();
  if (/^[0-9a-fA-F]{24}$/.test(trimmed)) return "objectid";
  if (/^\d+$/.test(trimmed) && trimmed.length <= MAX_SNOWFLAKE_DIGITS) return "snowflake";
  return null;
}

/** 统一入口：kind 为 auto 时先分流，否则按指定类型解析。 */
export function parseId(
  input: string,
  kind: IdKind,
  epoch: number,
  layout: SnowflakeLayout = DEFAULT_LAYOUT
): ConvertResult<IdView> {
  const trimmed = input.trim();
  if (!trimmed) return err("请输入 ID");

  const resolved = kind === "auto" ? detectKind(trimmed) : kind;
  if (!resolved) {
    return err("无法识别的 ID 格式：雪花 ID 应为不超过 19 位的十进制数字，ObjectId 应为 24 位十六进制字符");
  }

  return resolved === "objectid" ? parseObjectId(trimmed) : parseSnowflake(trimmed, epoch, layout);
}
