import { describe, it, expect } from "vitest";
import { splitWords, convertNaming, convertNamingLines, SPLIT_RULES } from "./naming";

describe("分词规则", () => {
  it("按显式分隔符切分", () => {
    expect(splitWords("foo_bar-baz qux")).toEqual(["foo", "bar", "baz", "qux"]);
    expect(splitWords("com.example.name")).toEqual(["com", "example", "name"]);
  });

  it("小写→大写边界切分", () => {
    expect(splitWords("fooBarBaz")).toEqual(["foo", "Bar", "Baz"]);
  });

  it("连续大写后接小写时在最后一个大写前切分", () => {
    expect(splitWords("HTTPServer")).toEqual(["HTTP", "Server"]);
    expect(splitWords("parseHTTPResponse")).toEqual(["parse", "HTTP", "Response"]);
  });

  it("末尾的连续大写整体成词", () => {
    expect(splitWords("userID")).toEqual(["user", "ID"]);
  });

  it("字母后紧跟数字不切分", () => {
    expect(splitWords("address1")).toEqual(["address1"]);
    expect(splitWords("md5")).toEqual(["md5"]);
  });

  it("数字后接大写字母切分", () => {
    expect(splitWords("user2Name")).toEqual(["user2", "Name"]);
  });

  it("连续分隔符产生的空词丢弃", () => {
    expect(splitWords("foo__bar")).toEqual(["foo", "bar"]);
    expect(splitWords("  foo  bar  ")).toEqual(["foo", "bar"]);
  });

  it("混合形式按规则叠加", () => {
    expect(splitWords("foo_barBaz")).toEqual(["foo", "bar", "Baz"]);
  });

  it("无内容时得到空数组", () => {
    expect(splitWords("")).toEqual([]);
    expect(splitWords("___")).toEqual([]);
  });

  it("规则说明表与实现一致", () => {
    for (const r of SPLIT_RULES) {
      expect(splitWords(r.input).join(" ")).toBe(r.output);
    }
  });
});

describe("八种目标风格重组", () => {
  const src = "foo_barBaz";

  it("camelCase", () => expect(convertNaming(src, "camel")).toBe("fooBarBaz"));
  it("PascalCase", () => expect(convertNaming(src, "pascal")).toBe("FooBarBaz"));
  it("snake_case", () => expect(convertNaming(src, "snake")).toBe("foo_bar_baz"));
  it("kebab-case", () => expect(convertNaming(src, "kebab")).toBe("foo-bar-baz"));
  it("CONSTANT_CASE", () => expect(convertNaming(src, "constant")).toBe("FOO_BAR_BAZ"));
  it("UPPER", () => expect(convertNaming(src, "upper")).toBe("FOO BAR BAZ"));
  it("lower", () => expect(convertNaming(src, "lower")).toBe("foo bar baz"));
  it("Title", () => expect(convertNaming(src, "title")).toBe("Foo Bar Baz"));
});

describe("规格中的边界用例", () => {
  it("fooBarBaz → snake_case", () => {
    expect(convertNaming("fooBarBaz", "snake")).toBe("foo_bar_baz");
  });

  it("HTTPServer → snake_case", () => {
    expect(convertNaming("HTTPServer", "snake")).toBe("http_server");
  });

  it("address1 → snake_case 数字不被切开", () => {
    expect(convertNaming("address1", "snake")).toBe("address1");
  });

  it("user2Name → snake_case", () => {
    expect(convertNaming("user2Name", "snake")).toBe("user2_name");
  });

  it("foo_barBaz → kebab-case", () => {
    expect(convertNaming("foo_barBaz", "kebab")).toBe("foo-bar-baz");
  });
});

describe("逐行批量转换", () => {
  it("行数与顺序不变，空行原样保留", () => {
    const out = convertNamingLines(["fooBar", "", "baz_qux"], "pascal");
    expect(out).toEqual(["FooBar", "", "BazQux"]);
  });
});
