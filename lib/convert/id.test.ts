import { describe, it, expect } from "vitest";
import {
  parseId,
  parseSnowflake,
  parseObjectId,
  detectKind,
  validateLayout,
  DEFAULT_LAYOUT,
  EPOCH_PRESETS,
  SnowflakeView,
  ObjectIdView,
} from "./id";

const TWITTER_EPOCH = EPOCH_PRESETS[0].value; // 1288834974657

/**
 * 按默认位分配（41/10/12）合成一个雪花 ID，用于反向校验解析结果。
 * 全程 BigInt，避免构造用例时就先丢了精度。
 */
function makeSnowflake(deltaMs: bigint, machine: bigint, seq: bigint): string {
  return ((deltaMs << 22n) | (machine << 12n) | seq).toString();
}

describe("雪花 ID 解析", () => {
  it("按默认纪元与位宽拆解三段", () => {
    const id = makeSnowflake(1_000_000n, 5n, 42n);
    const r = parseSnowflake(id, TWITTER_EPOCH);
    expect(r.ok).toBe(true);
    const v = r.value!;
    expect(v.timestampDelta).toBe("1000000");
    expect(v.machineId).toBe("5");
    expect(v.sequence).toBe("42");
    expect(v.millis).toBe(TWITTER_EPOCH + 1_000_000);
  });

  it("时间同时给出本地与 UTC", () => {
    const r = parseSnowflake(makeSnowflake(0n, 0n, 0n), TWITTER_EPOCH);
    const v = r.value!;
    expect(v.time.iso).toBe(new Date(TWITTER_EPOCH).toISOString());
    expect(v.time.utc).toBe(new Date(TWITTER_EPOCH).toUTCString());
    expect(v.time.local).toBe(new Date(TWITTER_EPOCH).toLocaleString());
  });

  it("换纪元后时间整体平移，三段值不变", () => {
    const id = makeSnowflake(5_000n, 3n, 7n);
    const a = parseSnowflake(id, TWITTER_EPOCH).value!;
    const b = parseSnowflake(id, 0).value!;
    expect(b.machineId).toBe(a.machineId);
    expect(b.sequence).toBe(a.sequence);
    expect(a.millis - b.millis).toBe(TWITTER_EPOCH);
  });

  it("自定义位宽改变拆解结果", () => {
    // 同一个 ID 在 41/10/12 与 41/5/17 两种分配下拆出的机器位/序列不同
    const id = makeSnowflake(100n, 1n, 1n);
    const wide = parseSnowflake(id, TWITTER_EPOCH, {
      timestampBits: 41,
      machineBits: 5,
      sequenceBits: 17,
    }).value!;
    expect(wide.sequence).not.toBe("1");
    expect(wide.machineId).toBe("0");
  });

  it("超过 MAX_SAFE_INTEGER 的 ID 不丢精度", () => {
    // 取贴近真实的时间偏移（约 15 年），相邻两个 ID 只差 1，
    // Number 解析会把它们算成同一个值，BigInt 才能分辨。
    const base = makeSnowflake(500_000_000_000n, 1023n, 4094n);
    const next = (BigInt(base) + 1n).toString();
    expect(Number(base)).toBe(Number(next)); // 前提：Number 确实分不清
    const a = parseSnowflake(base, TWITTER_EPOCH).value!;
    const b = parseSnowflake(next, TWITTER_EPOCH).value!;
    expect(a.sequence).toBe("4094");
    expect(b.sequence).toBe("4095");
  });

  it("位宽之和超过 63 报错", () => {
    const r = parseSnowflake("123", TWITTER_EPOCH, {
      timestampBits: 41,
      machineBits: 12,
      sequenceBits: 12,
    });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("65");
  });

  it("ID 超出 64 位有符号范围报错", () => {
    const r = parseSnowflake((1n << 63n).toString(), TWITTER_EPOCH);
    expect(r.ok).toBe(false);
    expect(r.error).toContain("64 位");
  });

  it("非数字输入报错", () => {
    expect(parseSnowflake("12a3", TWITTER_EPOCH).ok).toBe(false);
    expect(parseSnowflake("", TWITTER_EPOCH).ok).toBe(false);
    expect(parseSnowflake("-1", TWITTER_EPOCH).ok).toBe(false);
  });
});

describe("位宽校验", () => {
  it("默认位宽合法", () => {
    expect(validateLayout(DEFAULT_LAYOUT).ok).toBe(true);
  });

  it("负数位宽报错", () => {
    const r = validateLayout({ timestampBits: -1, machineBits: 10, sequenceBits: 12 });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("时间戳位");
  });

  it("恰好 63 位合法", () => {
    expect(validateLayout({ timestampBits: 41, machineBits: 10, sequenceBits: 12 }).ok).toBe(true);
    expect(validateLayout({ timestampBits: 63, machineBits: 0, sequenceBits: 0 }).ok).toBe(true);
  });
});

describe("ObjectId 解析", () => {
  it("前 4 字节解出秒级时间", () => {
    // 0x65a1b2c3 = 1705125059 → 2024-01-13T07:10:59Z
    const r = parseObjectId("65a1b2c3d4e5f60718293a4b");
    expect(r.ok).toBe(true);
    const v = r.value!;
    expect(v.seconds).toBe(0x65a1b2c3);
    expect(v.time.iso).toBe(new Date(0x65a1b2c3 * 1000).toISOString());
    expect(v.rest).toBe("d4e5f60718293a4b");
  });

  it("大写十六进制同样接受", () => {
    expect(parseObjectId("65A1B2C3D4E5F60718293A4B").ok).toBe(true);
  });

  it("长度或字符非法报错", () => {
    expect(parseObjectId("65a1b2c3").ok).toBe(false);
    expect(parseObjectId("65a1b2c3d4e5f60718293a4z").ok).toBe(false);
  });
});

describe("类型自动分流", () => {
  it("24 位十六进制判为 ObjectId", () => {
    expect(detectKind("65a1b2c3d4e5f60718293a4b")).toBe("objectid");
  });

  it("24 位纯数字仍判为 ObjectId（超出雪花 ID 位数上限）", () => {
    expect(detectKind("123456789012345678901234")).toBe("objectid");
  });

  it("19 位以内纯数字判为雪花", () => {
    expect(detectKind("1234567890123456789")).toBe("snowflake");
    expect(detectKind("1")).toBe("snowflake");
  });

  it("其他形态不分流", () => {
    expect(detectKind("hello")).toBeNull();
    expect(detectKind("12345678901234567890")).toBeNull(); // 20 位数字，两边都不是
  });
});

describe("统一入口 parseId", () => {
  it("auto 模式分流到 ObjectId", () => {
    const r = parseId("65a1b2c3d4e5f60718293a4b", "auto", TWITTER_EPOCH);
    expect(r.ok).toBe(true);
    expect((r.value as ObjectIdView).kind).toBe("objectid");
  });

  it("auto 模式分流到雪花", () => {
    const r = parseId(makeSnowflake(1n, 2n, 3n), "auto", TWITTER_EPOCH);
    expect(r.ok).toBe(true);
    expect((r.value as SnowflakeView).kind).toBe("snowflake");
  });

  it("手动指定类型时不走分流", () => {
    // 24 位纯数字在 auto 下是 ObjectId，显式指定 snowflake 则按雪花解析并因超范围报错
    const r = parseId("123456789012345678901234", "snowflake", TWITTER_EPOCH);
    expect(r.ok).toBe(false);
    expect(r.error).toContain("64 位");
  });

  it("无法识别时给出格式说明", () => {
    const r = parseId("not-an-id", "auto", TWITTER_EPOCH);
    expect(r.ok).toBe(false);
    expect(r.error).toContain("24 位十六进制");
  });

  it("空输入报错", () => {
    expect(parseId("   ", "auto", TWITTER_EPOCH).ok).toBe(false);
  });
});
