import { describe, it, expect } from "vitest";
import {
  toLines,
  dedupe,
  sortLines,
  removeEmpty,
  trimLines,
  affix,
  numberLines,
  reverseLines,
  setOperate,
} from "./lines";

describe("行切分", () => {
  it("统一 CRLF 并丢弃末尾空尾行", () => {
    expect(toLines("a\r\nb\n")).toEqual(["a", "b"]);
  });

  it("空文本得到单个空行", () => {
    expect(toLines("")).toEqual([""]);
  });
});

describe("去重", () => {
  it("保留首次出现的顺序", () => {
    expect(dedupe(["b", "a", "b", "c", "a"])).toEqual(["b", "a", "c"]);
  });
});

describe("排序", () => {
  it("字典序", () => {
    const r = sortLines(["b", "c", "a"], "lexical");
    expect(r.value).toEqual(["a", "b", "c"]);
  });

  it("字典序反序", () => {
    const r = sortLines(["b", "c", "a"], "lexical", true);
    expect(r.value).toEqual(["c", "b", "a"]);
  });

  it("数值序不按字符串比较", () => {
    const r = sortLines(["10", "9", "100"], "numeric");
    expect(r.value).toEqual(["9", "10", "100"]);
  });

  it("按行长度排序", () => {
    const r = sortLines(["abc", "a", "ab"], "length");
    expect(r.value).toEqual(["a", "ab", "abc"]);
  });

  it("数值排序遇非数值行报可读错误并指出行号", () => {
    const r = sortLines(["1", "x", "3"], "numeric");
    expect(r.ok).toBe(false);
    expect(r.error).toContain("第 2 行");
    expect(r.error).toContain("不是合法数值");
  });

  it("数值排序遇空行也报错，不静默排序", () => {
    expect(sortLines(["1", "", "3"], "numeric").ok).toBe(false);
  });
});

describe("清理与加缀", () => {
  it("去空行含仅空白的行", () => {
    expect(removeEmpty(["a", "", "  ", "b"])).toEqual(["a", "b"]);
  });

  it("去首尾空白", () => {
    expect(trimLines(["  a  ", "\tb"])).toEqual(["a", "b"]);
  });

  it("加前缀后缀", () => {
    expect(affix(["a", "b"], "'", "',")).toEqual(["'a',", "'b',"]);
  });

  it("整体反转", () => {
    expect(reverseLines(["a", "b", "c"])).toEqual(["c", "b", "a"]);
  });
});

describe("加行号", () => {
  it("默认从 1 开始", () => {
    expect(numberLines(["a", "b"])).toEqual(["1. a", "2. b"]);
  });

  it("起始值可指定", () => {
    expect(numberLines(["a", "b"], 10)).toEqual(["10. a", "11. b"]);
  });

  it("序号右对齐到最宽的一个", () => {
    expect(numberLines(["a", "b"], 9)).toEqual([" 9. a", "10. b"]);
  });
});

describe("集合运算", () => {
  const left = ["a", "b", "c", "a"];
  const right = ["b", "c", "d"];

  it("交集", () => {
    expect(setOperate(left, right, "intersect")).toEqual(["b", "c"]);
  });

  it("差集为左减右", () => {
    expect(setOperate(left, right, "difference")).toEqual(["a"]);
  });

  it("并集去重", () => {
    expect(setOperate(left, right, "union")).toEqual(["a", "b", "c", "d"]);
  });
});
