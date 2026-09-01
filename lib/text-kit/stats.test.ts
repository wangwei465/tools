import { describe, it, expect } from "vitest";
import { computeStats } from "./stats";

describe("文本统计", () => {
  it("空输入各项为 0 且不报错", () => {
    expect(computeStats("")).toEqual({
      chars: 0,
      charsNoWhitespace: 0,
      lines: 0,
      words: 0,
      bytes: 0,
      maxLineLength: 0,
      minLineLength: 0,
    });
  });

  it("基础度量", () => {
    const s = computeStats("hello world\nfoo");
    expect(s.chars).toBe(15);
    expect(s.lines).toBe(2);
    expect(s.words).toBe(3);
  });

  it("区分含空白与不含空白的字符数", () => {
    const s = computeStats("a b\tc\nd");
    expect(s.chars).toBe(7);
    expect(s.charsNoWhitespace).toBe(4);
  });

  it("中文的 UTF-8 字节数为每字 3 字节", () => {
    const s = computeStats("中文");
    expect(s.chars).toBe(2);
    expect(s.bytes).toBe(6);
  });

  it("ASCII 的字节数与字符数一致", () => {
    expect(computeStats("abc").bytes).toBe(3);
  });

  it("emoji 按实际编码计算字节数", () => {
    expect(computeStats("😀").bytes).toBe(4);
  });

  it("各行长度的最大最小值", () => {
    const s = computeStats("a\nabcd\nab");
    expect(s.maxLineLength).toBe(4);
    expect(s.minLineLength).toBe(1);
  });

  it("CRLF 不额外计入行长度", () => {
    const s = computeStats("ab\r\ncd");
    expect(s.lines).toBe(2);
    expect(s.maxLineLength).toBe(2);
  });

  it("仅含空白时词数为 0", () => {
    expect(computeStats("   \n  ").words).toBe(0);
  });
});
