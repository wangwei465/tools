import { describe, it, expect } from "vitest";
import {
  parseRadix,
  formatAll,
  listSetBits,
  evalBitExpr,
  MAX_BIT_LIST,
} from "./radix";

describe("进制解析与格式化", () => {
  it("四种进制解析同一数值", () => {
    expect(parseRadix("255", 10).value).toBe(255n);
    expect(parseRadix("11111111", 2).value).toBe(255n);
    expect(parseRadix("377", 8).value).toBe(255n);
    expect(parseRadix("FF", 16).value).toBe(255n);
    expect(parseRadix("ff", 16).value).toBe(255n);
  });

  it("输出四种进制表示", () => {
    expect(formatAll(255n)).toEqual({ bin: "11111111", oct: "377", dec: "255", hex: "FF" });
  });

  it("负数解析与格式化", () => {
    expect(parseRadix("-10", 10).value).toBe(-10n);
    expect(parseRadix("-FF", 16).value).toBe(-255n);
    expect(formatAll(-255n).hex).toBe("-FF");
  });

  it("大整数不丢精度", () => {
    const big = "123456789012345678901234567890";
    const r = parseRadix(big, 10);
    expect(r.ok).toBe(true);
    expect(formatAll(r.value!).dec).toBe(big);
    // 超过 2^53 后 Number 已无法精确表示，BigInt 往返仍然一致
    expect(Number(big).toString()).not.toBe(big);
  });

  it("非法字符按进制分别报错", () => {
    expect(parseRadix("2", 2).ok).toBe(false);
    expect(parseRadix("8", 8).ok).toBe(false);
    expect(parseRadix("A", 10).ok).toBe(false);
    expect(parseRadix("G", 16).ok).toBe(false);
    expect(parseRadix("12", 2).error).toContain("二进制");
  });

  it("空输入报错", () => {
    expect(parseRadix("   ", 10).ok).toBe(false);
    expect(parseRadix("-", 10).ok).toBe(false);
  });
});

describe("置位解读", () => {
  it("列出被置为 1 的位与权重", () => {
    const v = listSetBits(0b1011n);
    expect(v.unsupported).toBe(false);
    expect(v.bits).toEqual([
      { index: 0, weight: "1" },
      { index: 1, weight: "2" },
      { index: 3, weight: "8" },
    ]);
  });

  it("零值无置位", () => {
    expect(listSetBits(0n).bits).toEqual([]);
  });

  it("超过 32 位的权限位正确解读", () => {
    const v = listSetBits(1n << 40n);
    expect(v.bits).toEqual([{ index: 40, weight: (1n << 40n).toString() }]);
  });

  it("负数不做置位解读", () => {
    const v = listSetBits(-1n);
    expect(v.unsupported).toBe(true);
    expect(v.bits).toEqual([]);
  });

  it("超长位图被截断并标记", () => {
    const v = listSetBits(1n << BigInt(MAX_BIT_LIST + 10));
    expect(v.truncated).toBe(true);
  });
});

describe("位运算表达式求值", () => {
  it("各运算符", () => {
    expect(evalBitExpr("12 & 10").value).toBe(8n);
    expect(evalBitExpr("12 | 10").value).toBe(14n);
    expect(evalBitExpr("12 ^ 10").value).toBe(6n);
    expect(evalBitExpr("1 << 4").value).toBe(16n);
    expect(evalBitExpr("256 >> 4").value).toBe(16n);
    expect(evalBitExpr("~0").value).toBe(-1n);
    expect(evalBitExpr("-5").value).toBe(-5n);
  });

  it("十六进制 / 二进制 / 八进制字面量", () => {
    expect(evalBitExpr("0xFF & 0x0F").value).toBe(15n);
    expect(evalBitExpr("0b1010 | 0b0101").value).toBe(15n);
    expect(evalBitExpr("0o17").value).toBe(15n);
  });

  it("优先级：移位 > & > ^ > |", () => {
    // 1 | 2 ^ 3 & 1 << 2  =>  1 | (2 ^ (3 & (1<<2)))  =>  1 | (2 ^ 0) => 3
    expect(evalBitExpr("1 | 2 ^ 3 & 1 << 2").value).toBe(3n);
    expect(evalBitExpr("1 & 3 | 4").value).toBe(5n);
  });

  it("括号改变优先级", () => {
    expect(evalBitExpr("(1 | 2) & 2").value).toBe(2n);
    expect(evalBitExpr("(1 | 2) ^ (4 | 8)").value).toBe(15n);
  });

  it("一元运算符可嵌套", () => {
    expect(evalBitExpr("~~5").value).toBe(5n);
    expect(evalBitExpr("~(1 << 3)").value).toBe(-9n);
  });

  it("大整数位运算不被截断到 32 位", () => {
    // Number 的 | 运算会把结果截到 32 位，BigInt 不会
    const r = evalBitExpr("(1 << 40) | 1");
    expect(r.value).toBe((1n << 40n) | 1n);
  });

  it("空输入报错", () => {
    expect(evalBitExpr("").ok).toBe(false);
    expect(evalBitExpr("   ").ok).toBe(false);
  });

  it("不支持的字符报错并给出位置", () => {
    const r = evalBitExpr("1 + 2");
    expect(r.ok).toBe(false);
    expect(r.error).toContain("不支持的字符");
    expect(r.error).toContain("位置 3");
  });

  it("拒绝执行任意代码", () => {
    // 若实现走 eval，下面两条会分别执行成功或抛出 ReferenceError 而非我们的可读提示
    const a = evalBitExpr("process.exit(1)");
    expect(a.ok).toBe(false);
    expect(a.error).toContain("不支持的字符");
    const b = evalBitExpr("1;alert(1)");
    expect(b.ok).toBe(false);
  });

  it("括号不匹配报错", () => {
    expect(evalBitExpr("(1 | 2").error).toContain("缺少右括号");
    expect(evalBitExpr("1 | 2)").error).toContain("多余内容");
  });

  it("表达式不完整报错", () => {
    expect(evalBitExpr("1 &").error).toContain("不完整");
    expect(evalBitExpr("~").error).toContain("不完整");
  });

  it("非法数字字面量报错", () => {
    expect(evalBitExpr("0x").error).toContain("缺少数字");
    expect(evalBitExpr("0xZZ").error).toContain("缺少数字");
    expect(evalBitExpr("12abc").error).toContain("意外字符");
  });

  it("移位位数非法报错", () => {
    expect(evalBitExpr("1 << -1").error).toContain("不能为负");
    expect(evalBitExpr("1 << 99999").error).toContain("过大");
  });

  it("单个 < 或 > 给出明确提示", () => {
    expect(evalBitExpr("1 < 2").error).toContain("<< 或 >>");
  });
});
