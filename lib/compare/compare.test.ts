import { describe, it, expect } from "vitest";
import { canonicalize, parseJson, sortKeysDeep } from "./normalize";
import { sha256Hex } from "./hash";
import { diffJson } from "./jsonDiff";

describe("normalize / canonicalize", () => {
  it("对象 key 顺序无关：规范化后相等", () => {
    const a = canonicalize({ a: 1, b: 2 });
    const b = canonicalize({ b: 2, a: 1 });
    expect(a).toBe(b);
  });

  it("嵌套对象 key 也递归排序", () => {
    const a = canonicalize({ x: { p: 1, q: 2 }, y: 3 });
    const b = canonicalize({ y: 3, x: { q: 2, p: 1 } });
    expect(a).toBe(b);
  });

  it("数组顺序敏感：顺序不同则规范化不同", () => {
    const a = canonicalize(["a", "b"] as any);
    const b = canonicalize(["b", "a"] as any);
    expect(a).not.toBe(b);
  });

  it("空白差异不影响（因为重新 stringify）", () => {
    const a = canonicalize(parseJson('{"a":1,  "b":2}').value!);
    const b = canonicalize(parseJson('{\n  "a": 1,\n  "b": 2\n}').value!);
    expect(a).toBe(b);
  });
});

describe("parseJson", () => {
  it("合法 JSON 返回 ok", () => {
    const r = parseJson('{"a":1}');
    expect(r.ok).toBe(true);
    expect(r.value).toEqual({ a: 1 });
  });

  it("非法 JSON 返回错误", () => {
    const r = parseJson('{"a":');
    expect(r.ok).toBe(false);
    expect(r.error).toBeTruthy();
  });

  it("空内容返回错误", () => {
    expect(parseJson("   ").ok).toBe(false);
  });
});

describe("sha256Hex", () => {
  it("已知向量：空字符串", async () => {
    expect(await sha256Hex("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    );
  });

  it("语义相同的 JSON 规范化后 hash 相等", async () => {
    const h1 = await sha256Hex(canonicalize({ a: 1, b: 2 }));
    const h2 = await sha256Hex(canonicalize({ b: 2, a: 1 }));
    expect(h1).toBe(h2);
  });

  it("数组顺序不同则 hash 不等", async () => {
    const h1 = await sha256Hex(canonicalize(["a", "b"] as any));
    const h2 = await sha256Hex(canonicalize(["b", "a"] as any));
    expect(h1).not.toBe(h2);
  });
});

describe("diffJson", () => {
  it("值不同：changed，带左右值", () => {
    const d = diffJson({ user: { age: 20 } }, { user: { age: 21 } });
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({
      path: "user.age",
      type: "changed",
      left: 20,
      right: 21,
    });
  });

  it("右侧多出：added", () => {
    const d = diffJson({ a: 1 }, { a: 1, email: "x@y" });
    expect(d).toEqual([
      { path: "email", type: "added", right: "x@y" },
    ]);
  });

  it("右侧缺失：removed", () => {
    const d = diffJson({ a: 1, phone: "123" }, { a: 1 });
    expect(d).toEqual([
      { path: "phone", type: "removed", left: "123" },
    ]);
  });

  it("key 顺序不同不产生差异", () => {
    const d = diffJson({ a: 1, b: 2 }, { b: 2, a: 1 });
    expect(d).toHaveLength(0);
  });

  it("数组顺序敏感：逐位比较产生 changed", () => {
    const d = diffJson({ tags: ["a", "b"] }, { tags: ["b", "a"] });
    const paths = d.map((e) => e.path).sort();
    expect(paths).toEqual(["tags[0]", "tags[1]"]);
  });

  it("数组长度不同：多出的下标为 added", () => {
    const d = diffJson({ list: [1] }, { list: [1, 2] });
    expect(d).toEqual([
      { path: "list[1]", type: "added", right: 2 },
    ]);
  });

  it("嵌套路径正确定位", () => {
    const d = diffJson(
      { a: { b: { c: 1 } } },
      { a: { b: { c: 2 } } }
    );
    expect(d[0].path).toBe("a.b.c");
  });

  it("完全相同无差异", () => {
    const d = diffJson({ a: [1, 2, 3], b: "x" }, { a: [1, 2, 3], b: "x" });
    expect(d).toHaveLength(0);
  });

  it("类型不同视为 changed（对象 vs 基本类型）", () => {
    const d = diffJson({ a: { x: 1 } }, { a: 1 });
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ path: "a", type: "changed" });
  });

  it("根级基本类型差异定位为 (root)", () => {
    const d = diffJson(1 as any, 2 as any);
    expect(d).toEqual([{ path: "(root)", type: "changed", left: 1, right: 2 }]);
  });

  it("null 与非 null 视为差异", () => {
    const d = diffJson({ a: null }, { a: 1 });
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ path: "a", type: "changed", left: null, right: 1 });
  });

  it("null 两侧相等无差异", () => {
    const d = diffJson({ a: null }, { a: null });
    expect(d).toHaveLength(0);
  });

  it("多层嵌套混合增删改", () => {
    const d = diffJson(
      { user: { name: "Tom", age: 20, phone: "123" } },
      { user: { name: "Tom", age: 21, email: "x@y" } }
    );
    const byPath = Object.fromEntries(d.map((e) => [e.path, e.type]));
    expect(byPath["user.age"]).toBe("changed");
    expect(byPath["user.phone"]).toBe("removed");
    expect(byPath["user.email"]).toBe("added");
  });
});
