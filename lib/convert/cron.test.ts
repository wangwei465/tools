import { describe, it, expect } from "vitest";
import { parseCron, MAX_PREVIEW } from "./cron";

/** 固定基准时间，避免用例依赖运行时刻。 */
const BASE = "2026-01-01T00:00:00Z";

describe("cron 执行时间预览", () => {
  it("5 段表达式按分钟推进", () => {
    const r = parseCron("*/5 * * * *", 3, BASE);
    expect(r.ok).toBe(true);
    const v = r.value!;
    expect(v.fieldCount).toBe(5);
    expect(v.next.map((n) => n.iso)).toEqual([
      "2026-01-01T00:05:00.000Z",
      "2026-01-01T00:10:00.000Z",
      "2026-01-01T00:15:00.000Z",
    ]);
  });

  it("6 段表达式按秒推进", () => {
    const r = parseCron("*/10 * * * * *", 2, BASE);
    expect(r.ok).toBe(true);
    expect(r.value!.fieldCount).toBe(6);
    expect(r.value!.next.map((n) => n.iso)).toEqual([
      "2026-01-01T00:00:10.000Z",
      "2026-01-01T00:00:20.000Z",
    ]);
  });

  it("按指定次数返回", () => {
    expect(parseCron("* * * * *", 1, BASE).value!.next).toHaveLength(1);
    expect(parseCron("* * * * *", 20, BASE).value!.next).toHaveLength(20);
  });

  it("基准时间决定起点", () => {
    const a = parseCron("0 0 * * *", 1, "2026-03-10T00:00:00Z").value!.next[0].iso;
    const b = parseCron("0 0 * * *", 1, "2026-06-10T00:00:00Z").value!.next[0].iso;
    expect(a).not.toBe(b);
  });

  it("每次执行同时给出本地与 ISO 表示", () => {
    const n = parseCron("*/5 * * * *", 1, BASE).value!.next[0];
    expect(n.iso).toBe("2026-01-01T00:05:00.000Z");
    expect(n.local).toBe(new Date(n.iso).toLocaleString());
  });

  it("留空基准时间时以当前时间为起点", () => {
    const r = parseCron("* * * * *", 1);
    expect(r.ok).toBe(true);
    expect(new Date(r.value!.next[0].iso).getTime()).toBeGreaterThan(Date.now() - 60_000);
  });
});

describe("cron 字段描述", () => {
  it("5 段字段名与描述", () => {
    const f = parseCron("30 2 * * 1", 1, BASE).value!.fields;
    expect(f.map((x) => x.name)).toEqual(["分钟", "小时", "日", "月", "星期"]);
    expect(f[0].desc).toBe("30");
    expect(f[2].desc).toBe("每日");
    expect(f[4].desc).toBe("周一");
  });

  it("6 段含秒字段", () => {
    const f = parseCron("0 0 12 * * *", 1, BASE).value!.fields;
    expect(f.map((x) => x.name)).toEqual(["秒", "分钟", "小时", "日", "月", "星期"]);
  });

  it("步进描述", () => {
    const f = parseCron("*/5 * * * *", 1, BASE).value!.fields;
    expect(f[0].desc).toBe("每 5 分钟");
  });

  it("区间与枚举描述", () => {
    const f = parseCron("0 9-18 * * 1,3,5", 1, BASE).value!.fields;
    expect(f[1].desc).toBe("9 到 18");
    expect(f[4].desc).toBe("周一、周三、周五");
  });

  it("区间步进描述", () => {
    const f = parseCron("0 9-18/2 * * *", 1, BASE).value!.fields;
    expect(f[1].desc).toContain("9 到 18 之间每 2 小时");
  });

  it("月份用名称描述", () => {
    const f = parseCron("0 0 1 3 *", 1, BASE).value!.fields;
    expect(f[3].desc).toBe("3 月");
  });

  it("英文别名同样识别", () => {
    const f = parseCron("0 0 * * MON", 1, BASE).value!.fields;
    expect(f[4].desc).toBe("周一");
  });

  it("Quartz 扩展语法在描述中被标注", () => {
    const r = parseCron("0 0 L * *", 1, BASE);
    expect(r.ok).toBe(true);
    expect(r.value!.fields[2].desc).toContain("Quartz 扩展语法");
  });

  it("预定义宏单独描述", () => {
    const r = parseCron("@daily", 1, BASE);
    expect(r.ok).toBe(true);
    expect(r.value!.macro).toBe(true);
    expect(r.value!.fields[0].name).toBe("预定义宏");
  });
});

describe("cron 错误处理", () => {
  it("空输入报错", () => {
    expect(parseCron("", 5, BASE).ok).toBe(false);
  });

  it("字段数不合法报错并给出实际段数", () => {
    const r = parseCron("* * *", 5, BASE);
    expect(r.ok).toBe(false);
    expect(r.error).toContain("字段数为 3");
  });

  it("字段数过多报错", () => {
    expect(parseCron("* * * * * * *", 5, BASE).ok).toBe(false);
  });

  it("取值越界报错", () => {
    const r = parseCron("99 * * * *", 5, BASE);
    expect(r.ok).toBe(false);
    expect(r.error).toContain("解析失败");
  });

  it("不支持的扩展语法给出专门提示", () => {
    const r = parseCron("0 0 15W * *", 5, BASE);
    expect(r.ok).toBe(false);
    expect(r.error).toContain("Quartz 扩展语法");
  });

  it("预览次数越界报错", () => {
    expect(parseCron("* * * * *", 0, BASE).ok).toBe(false);
    expect(parseCron("* * * * *", MAX_PREVIEW + 1, BASE).ok).toBe(false);
    expect(parseCron("* * * * *", 1.5, BASE).ok).toBe(false);
  });

  it("基准时间无法解析时报错", () => {
    const r = parseCron("* * * * *", 5, "not-a-date");
    expect(r.ok).toBe(false);
    expect(r.error).toContain("基准时间");
  });

  it("解析失败时不返回任何执行时间", () => {
    const r = parseCron("99 * * * *", 5, BASE);
    expect(r.value).toBeUndefined();
  });
});
