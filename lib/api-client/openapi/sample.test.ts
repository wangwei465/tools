import { describe, it, expect } from "vitest";
import {
  sampleFromSchema,
  sampleBodyText,
  sampleParamValue,
  sampleBodyFromContent,
  isJsonMediaType,
} from "./sample";
import { RefResolver } from "./ref";
import type { ImportIssue } from "./types";

function setup(doc: Record<string, unknown> = {}): { r: RefResolver; issues: ImportIssue[] } {
  const issues: ImportIssue[] = [];
  return { r: new RefResolver(doc, issues), issues };
}

/** 便捷断言：以空文档解析 schema。 */
function sample(schema: unknown, doc: Record<string, unknown> = {}): unknown {
  return sampleFromSchema(schema, setup(doc).r, "GET /t");
}

describe("取值优先级", () => {
  it("显式 example 优先于 default 与 type", () => {
    expect(sample({ type: "string", default: "d", example: "e" })).toBe("e");
  });

  it("examples 数组取首项（3.1 / JSON Schema 形式）", () => {
    expect(sample({ type: "integer", examples: [7, 8] })).toBe(7);
  });

  it("examples 对象取首个条目的 value", () => {
    expect(sample({ type: "string", examples: { a: { value: "va" }, b: { value: "vb" } } })).toBe("va");
  });

  it("无 example 时用 default", () => {
    expect(sample({ type: "integer", default: 42 })).toBe(42);
  });

  it("enum 取首值", () => {
    expect(sample({ type: "string", enum: ["ACTIVE", "LOCKED"] })).toBe("ACTIVE");
  });

  it("default 优先于 enum", () => {
    expect(sample({ type: "string", enum: ["A", "B"], default: "B" })).toBe("B");
  });
});

describe("按 type / format 生成占位", () => {
  it("各标量类型", () => {
    expect(sample({ type: "string" })).toBe("string");
    expect(sample({ type: "integer" })).toBe(0);
    expect(sample({ type: "number" })).toBe(0);
    expect(sample({ type: "boolean" })).toBe(false);
  });

  it("string 的常见 format", () => {
    expect(sample({ type: "string", format: "date-time" })).toBe("2024-01-01T00:00:00Z");
    expect(sample({ type: "string", format: "date" })).toBe("2024-01-01");
    expect(sample({ type: "string", format: "uuid" })).toBe("00000000-0000-0000-0000-000000000000");
    expect(sample({ type: "string", format: "email" })).toBe("user@example.com");
    expect(sample({ type: "string", format: "binary" })).toBe("");
    expect(sample({ type: "string", format: "unknown-fmt" })).toBe("string");
  });

  it("3.1 的联合类型取首个非 null 类型", () => {
    expect(sample({ type: ["string", "null"] })).toBe("string");
  });

  it("未知 / 缺失 type 生成 null 占位", () => {
    expect(sample({})).toBeNull();
    expect(sample({ type: "unknown" })).toBeNull();
  });
});

describe("嵌套结构", () => {
  it("对象逐字段展开", () => {
    expect(
      sample({
        type: "object",
        properties: { id: { type: "integer" }, name: { type: "string" } },
      })
    ).toEqual({ id: 0, name: "string" });
  });

  it("数组生成单元素示例", () => {
    expect(sample({ type: "array", items: { type: "string" } })).toEqual(["string"]);
  });

  it("无 items 的数组生成空数组", () => {
    expect(sample({ type: "array" })).toEqual([]);
  });

  it("对象套数组套对象", () => {
    expect(
      sample({
        type: "object",
        properties: {
          rows: {
            type: "array",
            items: { type: "object", properties: { ok: { type: "boolean" } } },
          },
        },
      })
    ).toEqual({ rows: [{ ok: false }] });
  });

  it("无 type 但有 properties 时按对象处理", () => {
    expect(sample({ properties: { a: { type: "integer" } } })).toEqual({ a: 0 });
  });

  it("allOf 合并各分支", () => {
    const doc = {
      components: {
        schemas: {
          Base: { type: "object", properties: { id: { type: "integer" } } },
        },
      },
    };
    expect(
      sample(
        {
          allOf: [
            { $ref: "#/components/schemas/Base" },
            { type: "object", properties: { name: { type: "string" } } },
          ],
        },
        doc
      )
    ).toEqual({ id: 0, name: "string" });
  });

  it("oneOf 取首个分支", () => {
    expect(sample({ oneOf: [{ type: "boolean" }, { type: "string" }] })).toBe(false);
  });
});

describe("含 $ref 的字段", () => {
  const doc = {
    components: {
      schemas: {
        User: {
          type: "object",
          properties: { id: { type: "integer" }, tag: { $ref: "#/components/schemas/Tag" } },
        },
        Tag: { type: "string", enum: ["red", "blue"] },
      },
    },
  };

  it("解析引用并据其生成示例", () => {
    expect(sample({ $ref: "#/components/schemas/User" }, doc)).toEqual({ id: 0, tag: "red" });
  });

  it("断链引用生成 null 占位且不影响同级字段", () => {
    const { r, issues } = setup(doc);
    const out = sampleFromSchema(
      {
        type: "object",
        properties: { ok: { type: "integer" }, bad: { $ref: "#/components/schemas/None" } },
      },
      r,
      "GET /t"
    );
    expect(out).toEqual({ ok: 0, bad: null });
    expect(issues.map((i) => i.type)).toContain("ref-missing");
  });
});

describe("sampleBodyText / sampleParamValue", () => {
  it("请求体序列化为缩进 2 的 JSON 文本", () => {
    const { r } = setup();
    expect(sampleBodyText({ type: "object", properties: { a: { type: "integer" } } }, r, "x")).toBe(
      '{\n  "a": 0\n}'
    );
  });

  it("参数值取标量的字符串形式", () => {
    const { r } = setup();
    expect(sampleParamValue({ type: "integer", default: 3 }, r, "x")).toBe("3");
    expect(sampleParamValue({ type: "string" }, r, "x")).toBe("string");
    expect(sampleParamValue({ type: "boolean" }, r, "x")).toBe("false");
    expect(sampleParamValue({}, r, "x")).toBe("");
    expect(sampleParamValue({ type: "array", items: { type: "integer" } }, r, "x")).toBe("[0]");
  });
});

describe("sampleBodyFromContent", () => {
  it("挑选 JSON 媒体类型并生成示例", () => {
    const { r, issues } = setup();
    const text = sampleBodyFromContent(
      { "application/json": { schema: { type: "object", properties: { a: { type: "string" } } } } },
      r,
      "POST /u",
      issues
    );
    expect(text).toBe('{\n  "a": "string"\n}');
    expect(issues).toHaveLength(0);
  });

  it("媒体类型层的 example 优先于 schema", () => {
    const { r, issues } = setup();
    const text = sampleBodyFromContent(
      { "application/json": { schema: { type: "object" }, example: { hi: 1 } } },
      r,
      "POST /u",
      issues
    );
    expect(text).toBe('{\n  "hi": 1\n}');
  });

  it("不支持的内容类型返回空 body 并记 issue", () => {
    const { r, issues } = setup();
    const text = sampleBodyFromContent(
      { "multipart/form-data": { schema: { type: "object" } } },
      r,
      "POST /upload",
      issues
    );
    expect(text).toBeNull();
    expect(issues).toHaveLength(1);
    expect(issues[0].type).toBe("body-unsupported");
    expect(issues[0].where).toBe("POST /upload");
  });

  it("无 content 时返回 null 且不记 issue", () => {
    const { r, issues } = setup();
    expect(sampleBodyFromContent(undefined, r, "POST /u", issues)).toBeNull();
    expect(sampleBodyFromContent({}, r, "POST /u", issues)).toBeNull();
    expect(issues).toHaveLength(0);
  });

  it("识别 +json 后缀的媒体类型", () => {
    expect(isJsonMediaType("application/vnd.api+json")).toBe(true);
    expect(isJsonMediaType("application/x-www-form-urlencoded")).toBe(false);
  });
});
