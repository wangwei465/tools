import { describe, it, expect } from "vitest";
import { RefResolver, isExternalRef } from "./ref";
import { isRecord, type ImportIssue } from "./types";
import { MAX_SCHEMA_DEPTH } from "./limits";

/**
 * 最小递归展开器——与 `sample.ts` 同形（$ref 走 resolve + enter，属性下钻走 enter），
 * 用于在不牵扯取值规则的前提下驱动 RefResolver 的护栏。
 */
function expand(schema: unknown, r: RefResolver, where = "GET /t"): unknown {
  if (!isRecord(schema)) return null;

  const ref = schema.$ref;
  if (typeof ref === "string") {
    const target = r.resolve(ref, where);
    if (target === null) return null;
    return r.enter(ref, where, () => expand(target, r, where));
  }

  const props = schema.properties;
  if (isRecord(props)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(props)) {
      out[k] = r.enter(null, where, () => expand(v, r, where));
    }
    return out;
  }
  return schema.type ?? null;
}

function setup(doc: Record<string, unknown>): { r: RefResolver; issues: ImportIssue[] } {
  const issues: ImportIssue[] = [];
  return { r: new RefResolver(doc, issues), issues };
}

describe("isExternalRef", () => {
  it("区分文档内引用与外部引用", () => {
    expect(isExternalRef("#/components/schemas/User")).toBe(false);
    expect(isExternalRef("./common.yaml#/User")).toBe(true);
    expect(isExternalRef("https://x.com/api.json#/User")).toBe(true);
  });
});

describe("RefResolver.resolve", () => {
  it("解析文档内引用", () => {
    const { r, issues } = setup({ components: { schemas: { User: { type: "object" } } } });
    expect(r.resolve("#/components/schemas/User", "GET /u")).toEqual({ type: "object" });
    expect(issues).toHaveLength(0);
  });

  it("反转义 JSON Pointer 的 ~1 与 ~0", () => {
    const { r } = setup({ paths: { "/a/b": { get: 1 } } });
    expect(r.resolve("#/paths/~1a~1b/get", "x")).toBe(1);
  });

  it("名称被百分号编码时回退到解码后查找", () => {
    const { r, issues } = setup({ definitions: { "Page«User»": { type: "object" } } });
    expect(r.resolve("#/definitions/Page%C2%ABUser%C2%BB", "x")).toEqual({ type: "object" });
    expect(issues).toHaveLength(0);
  });

  it("外部引用降级并记 issue", () => {
    const { r, issues } = setup({});
    expect(r.resolve("./common.yaml#/User", "GET /u")).toBeNull();
    expect(issues).toHaveLength(1);
    expect(issues[0].type).toBe("ref-external");
    expect(issues[0].where).toBe("./common.yaml#/User");
  });

  it("断链引用降级并记 issue", () => {
    const { r, issues } = setup({ components: { schemas: {} } });
    expect(r.resolve("#/components/schemas/Missing", "GET /u")).toBeNull();
    expect(issues).toHaveLength(1);
    expect(issues[0].type).toBe("ref-missing");
  });

  it("同一处降级只记一条", () => {
    const { r, issues } = setup({});
    r.resolve("./a.yaml#/X", "GET /1");
    r.resolve("./a.yaml#/X", "GET /2");
    expect(issues).toHaveLength(1);
  });
});

describe("RefResolver 循环截断", () => {
  it("自引用在有限步内返回且记 ref-cycle", () => {
    const doc = {
      definitions: {
        Node: { type: "object", properties: { next: { $ref: "#/definitions/Node" } } },
      },
    };
    const { r, issues } = setup(doc);
    const out = expand({ $ref: "#/definitions/Node" }, r);
    // 展开一层后，next 再次指向 Node 时命中引用栈，截断为 null
    expect(out).toEqual({ next: null });
    expect(issues.map((i) => i.type)).toContain("ref-cycle");
  });

  it("互引用在有限步内返回且记 ref-cycle", () => {
    const doc = {
      definitions: {
        A: { type: "object", properties: { b: { $ref: "#/definitions/B" } } },
        B: { type: "object", properties: { a: { $ref: "#/definitions/A" } } },
      },
    };
    const { r, issues } = setup(doc);
    const out = expand({ $ref: "#/definitions/A" }, r);
    // A → B 各展开一次，B 再次指回 A 时截断
    expect(out).toEqual({ b: { a: null } });
    expect(issues.map((i) => i.type)).toContain("ref-cycle");
  });

  it("非循环的引用链正常展开", () => {
    const doc = {
      definitions: {
        A: { type: "object", properties: { b: { $ref: "#/definitions/B" } } },
        B: { type: "object", properties: { n: { type: "integer" } } },
      },
    };
    const { r, issues } = setup(doc);
    expect(expand({ $ref: "#/definitions/A" }, r)).toEqual({ b: { n: "integer" } });
    expect(issues).toHaveLength(0);
  });

  it("离开引用后栈已弹出，同一引用可在旁支再次展开", () => {
    const doc = {
      definitions: {
        Leaf: { type: "string" },
        Pair: {
          type: "object",
          properties: { l: { $ref: "#/definitions/Leaf" }, r: { $ref: "#/definitions/Leaf" } },
        },
      },
    };
    const { r, issues } = setup(doc);
    expect(expand({ $ref: "#/definitions/Pair" }, r)).toEqual({ l: "string", r: "string" });
    expect(issues).toHaveLength(0);
  });
});

describe("RefResolver 深度上限", () => {
  it("无引用的深层嵌套在上限处截断并记 depth-limit", () => {
    // 构造 MAX_SCHEMA_DEPTH + 3 层 properties 嵌套（不含任何 $ref）
    let schema: Record<string, unknown> = { type: "string" };
    for (let i = 0; i < MAX_SCHEMA_DEPTH + 3; i++) {
      schema = { type: "object", properties: { p: schema } };
    }
    const { r, issues } = setup({});
    const out = expand(schema, r);

    let cur: unknown = out;
    let levels = 0;
    while (isRecord(cur)) {
      cur = cur.p;
      levels++;
    }
    expect(cur).toBeNull();
    // 顶层 expand 不经 enter，故成功下钻 MAX_SCHEMA_DEPTH 层，第 MAX+1 层被截断
    expect(levels).toBe(MAX_SCHEMA_DEPTH + 1);
    expect(issues.map((i) => i.type)).toContain("depth-limit");
  });
});
