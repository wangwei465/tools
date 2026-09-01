import { describe, it, expect } from "vitest";
import { inferFromJson } from "./infer";
import { generateGo } from "./go";

const gen = (json: string) => generateGo(inferFromJson(json).value!);

describe("Go 生成", () => {
  it("基础对象，每个字段带 json tag", () => {
    const { code } = gen('{"id":1,"name":"张三","ok":true,"score":1.5}');
    expect(code).toContain("type Root struct {");
    expect(code).toContain('`json:"id"`');
    expect(code).toMatch(/Id\s+int\s/);
    expect(code).toMatch(/Name\s+string\s/);
    expect(code).toMatch(/Ok\s+bool\s/);
    expect(code).toMatch(/Score\s+float64\s/);
  });

  it("嵌套子类型与切片", () => {
    const { code } = gen('{"user":{"id":1},"items":[{"n":1}]}');
    expect(code).toMatch(/User\s+User\s/);
    expect(code).toMatch(/Items\s+\[\]Item\s/);
    expect(code).toContain("type Item struct {");
  });

  it("可选字段用指针与 omitempty", () => {
    const { code } = gen('[{"a":1,"b":2},{"a":3}]');
    expect(code).toMatch(/B\s+\*int\s+`json:"b,omitempty"`/);
    expect(code).toMatch(/A\s+int\s+`json:"a"`/);
  });

  it("大整数走 int64", () => {
    expect(gen('{"id":90071992547409911}').code).toMatch(/Id\s+int64\s/);
  });

  it("不可推断值走 interface{}", () => {
    expect(gen('{"amount":null}').code).toContain("interface{}");
  });

  it("非法标识符转义、json tag 保留原名并列入清单", () => {
    const { code, notes } = gen('{"user-name":"x","2fa":true}');
    expect(code).toContain('`json:"user-name"`');
    expect(code).toContain("UserName");
    expect(code).toContain('`json:"2fa"`');
    expect(notes.map((n) => n.path).sort()).toEqual(["2fa", "user-name"]);
  });

  it("合法但非导出的键名不进清单", () => {
    expect(gen('{"id":1}').notes).toEqual([]);
  });
});
