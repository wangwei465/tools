import { describe, it, expect } from "vitest";
import { inferFromJson } from "./infer";
import { generateJava } from "./java";

const gen = (json: string) => generateJava(inferFromJson(json).value!);

describe("Java 生成", () => {
  it("基础对象为纯字段，不带任何注解", () => {
    const { code } = gen('{"id":1,"name":"张三","ok":true,"score":1.5}');
    expect(code).toContain("public class Root {");
    expect(code).toContain("    private Integer id;");
    expect(code).toContain("    private String name;");
    expect(code).toContain("    private Boolean ok;");
    expect(code).toContain("    private Double score;");
    expect(code).not.toContain("@");
  });

  it("嵌套子类型与 List 导入", () => {
    const { code } = gen('{"user":{"id":1},"items":[{"n":1}]}');
    expect(code).toContain("import java.util.List;");
    expect(code).toContain("private User user;");
    expect(code).toContain("private List<Item> items;");
    expect(code).toContain("public class Item {");
  });

  it("无数组时不生成 List 导入", () => {
    expect(gen('{"id":1}').code).not.toContain("import");
  });

  it("可选字段带注释说明", () => {
    const { code } = gen('[{"a":1,"b":2},{"a":3}]');
    expect(code).toContain("该字段未在全部样本中出现");
  });

  it("大整数走 Long", () => {
    expect(gen('{"id":90071992547409911}').code).toContain("private Long id;");
  });

  it("非法标识符转义、注释保留原名并列入清单", () => {
    const { code, notes } = gen('{"user-name":"x","2fa":true,"class":1}');
    expect(code).toContain("private String userName;");
    expect(code).toContain("原始 JSON 键名：user-name");
    expect(code).toContain("原始 JSON 键名：2fa");
    expect(code).toContain("原始 JSON 键名：class");
    expect(code).toContain("classValue");
    expect(notes.map((n) => n.path).sort()).toEqual(["2fa", "class", "user-name"]);
  });
});
