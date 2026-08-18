import { describe, it, expect } from "vitest";
import { formatIndexKeys, inferFields, serializeBson, valueTypeName } from "./mongo";

/** 构造一个仿 BSON 值：驱动的 ObjectId / Long 等都以 _bsontype 打标。 */
function fakeBson(type: string, text: string) {
  return { _bsontype: type, toString: () => text };
}

describe("serializeBson", () => {
  it("ObjectId 转十六进制串而非空对象", () => {
    const oid = fakeBson("ObjectId", "65f1c2a4e1b2c3d4e5f60718");
    expect(serializeBson({ _id: oid })).toEqual({ _id: "65f1c2a4e1b2c3d4e5f60718" });
    // 未做转换时 JSON.stringify 会得到 {}，这正是本函数要避免的
    expect(JSON.stringify(serializeBson({ _id: oid }))).not.toBe('{"_id":{}}');
  });

  it("Date 转 ISO 字符串", () => {
    expect(serializeBson({ at: new Date("2026-08-18T00:00:00.000Z") })).toEqual({
      at: "2026-08-18T00:00:00.000Z",
    });
  });

  it("Long / Decimal128 保留精度为字符串", () => {
    expect(serializeBson(fakeBson("Long", "9007199254740993"))).toBe("9007199254740993");
    expect(serializeBson(fakeBson("Decimal128", "12.3400"))).toBe("12.3400");
  });

  it("Binary 转 base64", () => {
    const bin = { _bsontype: "Binary", toString: (enc?: string) => (enc === "base64" ? "aGk=" : "Binary") };
    expect(serializeBson(bin)).toBe("aGk=");
  });

  it("RegExp 转字符串", () => {
    expect(serializeBson({ p: /^ab/i })).toEqual({ p: "/^ab/i" });
  });

  it("递归处理嵌套对象与数组", () => {
    const doc = {
      _id: fakeBson("ObjectId", "abc"),
      items: [{ at: new Date("2026-01-01T00:00:00.000Z") }, 3],
      meta: { deep: { oid: fakeBson("ObjectId", "def") } },
    };
    expect(serializeBson(doc)).toEqual({
      _id: "abc",
      items: [{ at: "2026-01-01T00:00:00.000Z" }, 3],
      meta: { deep: { oid: "def" } },
    });
  });

  it("标量与空值原样通过", () => {
    expect(serializeBson(1)).toBe(1);
    expect(serializeBson("s")).toBe("s");
    expect(serializeBson(true)).toBe(true);
    expect(serializeBson(null)).toBeNull();
    expect(serializeBson(undefined)).toBeNull();
  });
});

describe("valueTypeName", () => {
  it("区分标量、数组、对象、日期与 BSON 类型", () => {
    expect(valueTypeName("x")).toBe("string");
    expect(valueTypeName(1)).toBe("number");
    expect(valueTypeName(true)).toBe("boolean");
    expect(valueTypeName(null)).toBe("null");
    expect(valueTypeName([1, 2])).toBe("array");
    expect(valueTypeName({ a: 1 })).toBe("object");
    expect(valueTypeName(new Date())).toBe("date");
    expect(valueTypeName(fakeBson("ObjectId", "x"))).toBe("objectid");
  });
});

describe("inferFields", () => {
  it("聚合字段名与出现条数", () => {
    const r = inferFields([{ a: 1, b: "x" }, { a: 2 }, { a: 3 }]);
    expect(r.sampled).toBe(3);
    expect(r.fields.map((f) => f.path)).toEqual(["a", "b"]);
    expect(r.fields.find((f) => f.path === "a")?.presentCount).toBe(3);
    expect(r.fields.find((f) => f.path === "b")?.presentCount).toBe(1);
  });

  it("同名字段多类型时全部保留而非只取其一", () => {
    const r = inferFields([{ v: 1 }, { v: "s" }, { v: null }]);
    expect(r.fields[0].types).toEqual(["null", "number", "string"]);
  });

  it("缺失字段不会被计入出现条数", () => {
    const r = inferFields([{ a: 1 }, { b: 2 }]);
    expect(r.fields.every((f) => f.presentCount === 1)).toBe(true);
  });

  it("嵌套对象按点分路径展开", () => {
    const r = inferFields([{ buyer: { name: "n", addr: { city: "c" } } }]);
    expect(r.fields.map((f) => f.path)).toEqual([
      "buyer",
      "buyer.addr",
      "buyer.addr.city",
      "buyer.name",
    ]);
  });

  it("数组与 BSON 值不再向下展开", () => {
    const r = inferFields([{ tags: [{ x: 1 }], id: fakeBson("ObjectId", "o") }]);
    expect(r.fields.map((f) => f.path)).toEqual(["id", "tags"]);
    expect(r.fields.find((f) => f.path === "tags")?.types).toEqual(["array"]);
  });

  it("空集合返回空字段列表而非报错", () => {
    expect(inferFields([])).toEqual({ sampled: 0, fields: [] });
  });
});

describe("formatIndexKeys", () => {
  it("展示索引字段与方向", () => {
    expect(formatIndexKeys({ userId: 1, createdAt: -1 })).toBe("userId:1, createdAt:-1");
  });

  it("兼容文本索引等非数字方向", () => {
    expect(formatIndexKeys({ title: "text" })).toBe("title:text");
  });

  it("缺失键返回空串", () => {
    expect(formatIndexKeys(undefined)).toBe("");
    expect(formatIndexKeys(null)).toBe("");
  });
});
