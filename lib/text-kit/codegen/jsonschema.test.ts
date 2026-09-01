import { describe, it, expect } from "vitest";
import { inferFromJson } from "./infer";
import { generateJsonSchema } from "./jsonschema";

const gen = (json: string) => JSON.parse(generateJsonSchema(inferFromJson(json).value!).code);

describe("JSON Schema 生成", () => {
  it("基础对象的类型与 required", () => {
    const s = gen('{"id":1,"name":"张三","ok":true,"score":1.5}');
    expect(s.$ref).toBe("#/$defs/Root");
    const root = s.$defs.Root;
    expect(root.type).toBe("object");
    expect(root.properties).toEqual({
      id: { type: "integer" },
      name: { type: "string" },
      ok: { type: "boolean" },
      score: { type: "number" },
    });
    expect(root.required).toEqual(["id", "name", "ok", "score"]);
  });

  it("嵌套子类型走 $defs 与 $ref", () => {
    const s = gen('{"user":{"id":1},"items":[{"n":1}]}');
    expect(s.$defs.Root.properties.user).toEqual({ $ref: "#/$defs/User" });
    expect(s.$defs.Root.properties.items).toEqual({
      type: "array",
      items: { $ref: "#/$defs/Item" },
    });
    expect(s.$defs.Item.properties.n).toEqual({ type: "integer" });
  });

  it("可选字段不进 required", () => {
    const s = gen('[{"a":1,"b":2},{"a":3}]');
    expect(s.$defs.Root.required).toEqual(["a"]);
  });

  it("可空字段用 anyOf 表达", () => {
    const s = gen('[{"a":1},{"a":null}]');
    expect(s.$defs.Root.properties.a).toEqual({
      anyOf: [{ type: "integer" }, { type: "null" }],
    });
  });

  it("键名原样保留，无需转义", () => {
    const s = gen('{"user-name":"x","2fa":true}');
    expect(Object.keys(s.$defs.Root.properties)).toEqual(["user-name", "2fa"]);
    expect(generateJsonSchema(inferFromJson('{"user-name":"x"}').value!).notes).toEqual([]);
  });

  it("大整数为 integer、小数为 number", () => {
    const s = gen('{"big":90071992547409911,"f":1.5}');
    expect(s.$defs.Root.properties.big).toEqual({ type: "integer" });
    expect(s.$defs.Root.properties.f).toEqual({ type: "number" });
  });
});
