import { describe, it, expect } from "vitest";
import { inferFromJson } from "./infer";
import { generateTypeScript } from "./typescript";

const gen = (json: string) => generateTypeScript(inferFromJson(json).value!);

describe("TypeScript 生成", () => {
  it("基础对象", () => {
    const { code } = gen('{"id":1,"name":"张三","ok":true}');
    expect(code).toBe(
      ["export interface Root {", "  id: number;", "  name: string;", "  ok: boolean;", "}"].join("\n")
    );
  });

  it("嵌套子类型与数组", () => {
    const { code } = gen('{"user":{"id":1},"items":[{"n":1}]}');
    expect(code).toContain("user: User;");
    expect(code).toContain("items: Item[];");
    expect(code).toContain("export interface User {");
    expect(code).toContain("export interface Item {");
  });

  it("可选字段带问号，可空字段带 | null", () => {
    const { code } = gen('[{"a":1,"b":null},{"a":2}]');
    expect(code).toContain("a: number;");
    expect(code).toContain("b?: any | null;");
  });

  it("非法标识符用引号键保留原名并列入清单", () => {
    const { code, notes } = gen('{"user-name":"x","2fa":true}');
    expect(code).toContain('"user-name": string;');
    expect(code).toContain('"2fa": boolean;');
    expect(notes.map((n) => n.path).sort()).toEqual(["2fa", "user-name"]);
  });

  it("大整数与小数都映射为 number", () => {
    const { code } = gen('{"big":90071992547409911,"f":1.5}');
    expect(code).toContain("big: number;");
    expect(code).toContain("f: number;");
  });
});
