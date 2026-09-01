import { describe, it, expect } from "vitest";
import { replaceText } from "./replace";

const literal = { mode: "literal" as const };
const regex = { mode: "regex" as const };

describe("字面量替换", () => {
  it("替换全部出现处并给出次数", () => {
    const r = replaceText("a-b-a-b", "a", "X", literal);
    expect(r.value).toEqual({ text: "X-b-X-b", count: 2 });
  });

  it("元字符按字面量处理，不当作正则", () => {
    const r = replaceText("1.2.3", ".", "-", literal);
    expect(r.value!.text).toBe("1-2-3");
    expect(r.value!.count).toBe(2);
  });

  it("替换内容中的 $ 不被当作捕获组引用", () => {
    const r = replaceText("price", "price", "$1", literal);
    expect(r.value!.text).toBe("$1");
  });

  it("忽略大小写", () => {
    const r = replaceText("Foo foo", "foo", "bar", { ...literal, ignoreCase: true });
    expect(r.value).toEqual({ text: "bar bar", count: 2 });
  });
});

describe("正则替换", () => {
  it("支持捕获组引用", () => {
    const r = replaceText("2026-09-01", "(\\d{4})-(\\d{2})-(\\d{2})", "$3/$2/$1", regex);
    expect(r.value).toEqual({ text: "01/09/2026", count: 1 });
  });

  it("支持具名捕获组", () => {
    const r = replaceText("alice:18", "(?<name>\\w+):(?<age>\\d+)", "$<age> 岁的 $<name>", regex);
    expect(r.value!.text).toBe("18 岁的 alice");
  });

  it("多行模式下 ^ 匹配每行行首", () => {
    const r = replaceText("a\nb", "^", "> ", { ...regex, multiline: true });
    expect(r.value).toEqual({ text: "> a\n> b", count: 2 });
  });
});

describe("错误与边界", () => {
  it("非法正则给出可读错误，不抛异常", () => {
    const r = replaceText("abc", "(", "x", regex);
    expect(r.ok).toBe(false);
    expect(r.error).toContain("正则表达式非法");
  });

  it("空匹配内容被拒绝", () => {
    expect(replaceText("abc", "", "x", literal).ok).toBe(false);
  });

  it("无匹配时次数为 0 且原文不变", () => {
    const r = replaceText("abc", "zzz", "x", literal);
    expect(r.value).toEqual({ text: "abc", count: 0 });
  });
});
