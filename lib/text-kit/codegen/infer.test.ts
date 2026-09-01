import { describe, it, expect } from "vitest";
import { inferFromJson, typeNameOf, singularize } from "./infer";

const infer = (json: string) => {
  const r = inferFromJson(json);
  expect(r.ok, r.error).toBe(true);
  return r.value!;
};

const field = (r: ReturnType<typeof infer>, typeName: string, key: string) =>
  r.types.find((t) => t.name === typeName)!.fields.find((f) => f.key === key)!;

describe("基础推断", () => {
  it("根对象生成 Root 类型，字段类型与样本一致", () => {
    const r = infer('{"id":1,"name":"张三","ok":true,"score":1.5}');
    expect(r.rootName).toBe("Root");
    expect(r.types).toHaveLength(1);
    expect(r.types[0].fields.map((f) => [f.key, f.node.kind])).toEqual([
      ["id", "int"],
      ["name", "string"],
      ["ok", "boolean"],
      ["score", "double"],
    ]);
    expect(r.notes).toEqual([]);
  });

  it("非法 JSON 报可读错误", () => {
    const r = inferFromJson("{不是 json");
    expect(r.ok).toBe(false);
    expect(r.error).toContain("JSON 解析失败");
  });

  it("标量根被拒绝", () => {
    expect(inferFromJson("123").ok).toBe(false);
    expect(inferFromJson('["a"]').ok).toBe(false);
  });
});

describe("字段并集与可选性", () => {
  it("数组元素字段取并集", () => {
    const r = infer('[{"a":1},{"b":"x"}]');
    expect(r.types[0].fields.map((f) => f.key)).toEqual(["a", "b"]);
  });

  it("未在全部元素出现的字段为可选", () => {
    const r = infer('[{"a":1,"b":2},{"a":3}]');
    expect(field(r, "Root", "a").optional).toBe(false);
    expect(field(r, "Root", "b").optional).toBe(true);
  });
});

describe("嵌套子类型", () => {
  it("嵌套对象生成具名子类型，父类型引用它", () => {
    const r = infer('{"user":{"id":1}}');
    expect(field(r, "Root", "user").node).toEqual({ kind: "object", name: "User" });
    expect(r.types.map((t) => t.name)).toEqual(["Root", "User"]);
  });

  it("数组字段名去复数", () => {
    const r = infer('{"items":[{"id":1}]}');
    expect(r.types.map((t) => t.name)).toContain("Item");
  });

  it("去复数覆盖 ies / es / ss", () => {
    expect(singularize("categories")).toBe("category");
    expect(singularize("classes")).toBe("class");
    expect(singularize("address")).toBe("address");
    expect(typeNameOf("user_profiles")).toBe("UserProfile");
  });

  it("命名冲突追加数字后缀，无重名类型", () => {
    const r = infer('{"items":[{"id":1}],"item":{"name":"x"}}');
    const names = r.types.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toContain("Item");
    expect(names).toContain("Item2");
  });

  it("深层嵌套逐层生成", () => {
    const r = infer('{"a":{"b":{"c":{"d":1}}}}');
    expect(r.types.map((t) => t.name)).toEqual(["Root", "A", "B", "C"]);
  });

  it("数组元素跨元素合并为同一个子类型", () => {
    const r = infer('{"items":[{"a":1},{"b":2}]}');
    expect(r.types.filter((t) => t.name.startsWith("Item"))).toHaveLength(1);
    expect(r.types.find((t) => t.name === "Item")!.fields.map((f) => f.key)).toEqual(["a", "b"]);
  });
});

describe("不可推断值", () => {
  it("null 值走任意类型并列入清单", () => {
    const r = infer('{"amount":null}');
    expect(field(r, "Root", "amount").node.kind).toBe("any");
    expect(field(r, "Root", "amount").nullable).toBe(true);
    expect(r.notes.some((n) => n.path === "amount" && n.reason.includes("null"))).toBe(true);
  });

  it("部分为 null 时按非空样本推断且保留可空", () => {
    const r = infer('[{"a":1},{"a":null}]');
    expect(field(r, "Root", "a").node.kind).toBe("int");
    expect(field(r, "Root", "a").nullable).toBe(true);
  });

  it("空数组列入清单", () => {
    const r = infer('{"tags":[]}');
    expect(field(r, "Root", "tags").node).toEqual({ kind: "array", element: { kind: "any" } });
    expect(r.notes.some((n) => n.path === "tags" && n.reason.includes("空数组"))).toBe(true);
  });

  it("空对象生成空类型并列入清单", () => {
    const r = infer('{"meta":{}}');
    expect(r.types.find((t) => t.name === "Meta")!.fields).toEqual([]);
    expect(r.notes.some((n) => n.path === "meta" && n.reason.includes("空对象"))).toBe(true);
  });

  it("元素类型不一致的数组降级为任意类型并列入清单", () => {
    const r = infer('{"mixed":[1,"a"]}');
    expect(field(r, "Root", "mixed").node).toEqual({ kind: "array", element: { kind: "any" } });
    expect(r.notes.some((n) => n.path === "mixed[]" && n.reason.includes("不一致"))).toBe(true);
  });
});

describe("数值类型判定", () => {
  it("小数走浮点", () => {
    expect(field(infer('{"a":1.5}'), "Root", "a").node.kind).toBe("double");
  });

  it("安全范围内的整数走常规整数且不进清单", () => {
    const r = infer('{"a":42}');
    expect(field(r, "Root", "a").node.kind).toBe("int");
    expect(r.notes).toEqual([]);
  });

  it("超出安全整数范围走 64 位整数并列入清单", () => {
    const r = infer('{"id":90071992547409911}');
    expect(field(r, "Root", "id").node.kind).toBe("long");
    expect(r.notes.some((n) => n.path === "id" && n.reason.includes("安全整数"))).toBe(true);
  });

  it("整数与小数混合时取浮点", () => {
    expect(field(infer('[{"a":1},{"a":2.5}]'), "Root", "a").node.kind).toBe("double");
  });
});

describe("嵌套深度上限", () => {
  it("超深嵌套被拒绝且提示上限值", () => {
    let deep = "1";
    for (let i = 0; i < 40; i += 1) deep = `{"a":${deep}}`;
    const r = inferFromJson(deep);
    expect(r.ok).toBe(false);
    expect(r.error).toContain("嵌套深度");
  });

  it("上限内正常推断", () => {
    let deep = "1";
    for (let i = 0; i < 5; i += 1) deep = `{"a":${deep}}`;
    expect(inferFromJson(deep).ok).toBe(true);
  });
});
