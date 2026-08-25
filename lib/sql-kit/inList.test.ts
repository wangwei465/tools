import { describe, it, expect } from "vitest";
import { buildInList, DEFAULT_OPTIONS, InListOptions } from "./inList";

const opts = (over: Partial<InListOptions> = {}): InListOptions => ({ ...DEFAULT_OPTIONS, ...over });

describe("IN 列表生成", () => {
  it("带引号输出", () => {
    const r = buildInList("a\nb\nc", opts({ quote: true }));
    expect(r.ok).toBe(true);
    expect(r.value!.batches).toEqual(["'a','b','c'"]);
  });

  it("不带引号输出", () => {
    const r = buildInList("1\n2\n3", opts({ quote: false }));
    expect(r.value!.batches).toEqual(["1,2,3"]);
  });

  it("去重并保持首次出现顺序", () => {
    const r = buildInList("b\na\nb\nc\na", opts({ quote: false, dedupe: true }));
    expect(r.value!.batches).toEqual(["b,a,c"]);
    expect(r.value!.total).toBe(3);
    expect(r.value!.removed).toBe(2);
  });

  it("关闭去重时保留重复", () => {
    const r = buildInList("a\na", opts({ quote: false, dedupe: false }));
    expect(r.value!.batches).toEqual(["a,a"]);
    expect(r.value!.removed).toBe(0);
  });

  it("去除首尾空白与空行", () => {
    const r = buildInList("  a  \n\n\n  b  \n", opts({ quote: false }));
    expect(r.value!.batches).toEqual(["a,b"]);
  });

  it("剥掉输入自带的引号", () => {
    const r = buildInList("'a'\n\"b\"\nc", opts({ quote: true }));
    expect(r.value!.batches).toEqual(["'a','b','c'"]);
  });

  it("值内单引号被转义", () => {
    const r = buildInList("it's", opts({ quote: true }));
    expect(r.value!.batches).toEqual(["'it''s'"]);
  });

  it("按批切块", () => {
    const r = buildInList("1\n2\n3\n4\n5", opts({ quote: false, batchSize: 2 }));
    expect(r.value!.batches).toEqual(["1,2", "3,4", "5"]);
  });

  it("批大小为 0 表示不分批", () => {
    const r = buildInList("1\n2\n3", opts({ quote: false, batchSize: 0 }));
    expect(r.value!.batches).toHaveLength(1);
  });

  it("批大小大于总数时仍为一批", () => {
    const r = buildInList("1\n2", opts({ quote: false, batchSize: 100 }));
    expect(r.value!.batches).toEqual(["1,2"]);
  });
});

describe("切分方式", () => {
  it("自动同时认换行、逗号、分号与制表", () => {
    const r = buildInList("a,b;c\td\ne", opts({ quote: false, splitMode: "auto" }));
    expect(r.value!.batches).toEqual(["a,b,c,d,e"]);
  });

  it("仅按换行切分时逗号留在值内", () => {
    const r = buildInList("a,b\nc", opts({ quote: false, splitMode: "newline" }));
    expect(r.value!.batches).toEqual(["a,b,c"]);
    expect(r.value!.total).toBe(2);
  });

  it("仅按逗号切分时换行留在值内", () => {
    const r = buildInList("a\nb,c", opts({ quote: true, splitMode: "comma" }));
    expect(r.value!.total).toBe(2);
  });

  it("按空白切分", () => {
    const r = buildInList("a b  c", opts({ quote: false, splitMode: "space" }));
    expect(r.value!.batches).toEqual(["a,b,c"]);
  });
});

describe("错误处理", () => {
  it("空输入报错", () => {
    expect(buildInList("   ", DEFAULT_OPTIONS).ok).toBe(false);
  });

  it("全是分隔符时报错", () => {
    const r = buildInList(",,,\n\n", opts({ splitMode: "auto" }));
    expect(r.ok).toBe(false);
    expect(r.error).toContain("有效值");
  });

  it("批大小为负数报错", () => {
    const r = buildInList("a", opts({ batchSize: -1 }));
    expect(r.ok).toBe(false);
    expect(r.error).toContain("非负整数");
  });
});
