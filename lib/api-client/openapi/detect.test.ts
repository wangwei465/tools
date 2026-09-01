import { describe, it, expect } from "vitest";
import { detectVersion, parseDocument, DocParseError } from "./detect";
import { MAX_DOC_CHARS } from "./limits";

/** 期望 parseDocument 以指定 kind 失败，并返回其错误对象。 */
function expectFail(text: string, kind: string): DocParseError {
  try {
    parseDocument(text);
  } catch (e) {
    expect(e).toBeInstanceOf(DocParseError);
    expect((e as DocParseError).kind).toBe(kind);
    return e as DocParseError;
  }
  throw new Error("预期解析失败，实际成功");
}

describe("detectVersion", () => {
  it("识别 Swagger 2.0", () => {
    expect(detectVersion({ swagger: "2.0" })).toBe("2.0");
  });

  it("识别 OpenAPI 3.0.x", () => {
    expect(detectVersion({ openapi: "3.0.3" })).toBe("3.0");
  });

  it("识别 OpenAPI 3.1.x", () => {
    expect(detectVersion({ openapi: "3.1.0" })).toBe("3.1");
  });

  it("无版本字段返回 null", () => {
    expect(detectVersion({ info: { title: "x" }, paths: {} })).toBeNull();
  });

  it("非对象返回 null", () => {
    expect(detectVersion(null)).toBeNull();
    expect(detectVersion([1, 2])).toBeNull();
    expect(detectVersion("openapi: 3.0.0")).toBeNull();
  });
});

describe("parseDocument", () => {
  it("解析 JSON 文档", () => {
    const r = parseDocument('{"openapi":"3.0.1","info":{"title":"S"},"paths":{}}');
    expect(r.version).toBe("3.0");
    expect((r.doc.info as { title: string }).title).toBe("S");
  });

  it("解析 YAML 文档", () => {
    const r = parseDocument("swagger: '2.0'\ninfo:\n  title: S\npaths: {}\n");
    expect(r.version).toBe("2.0");
    expect((r.doc.info as { title: string }).title).toBe("S");
  });

  it("空输入报「不是文档」", () => {
    expectFail("   ", "not-openapi");
  });

  it("YAML 语法错误与「不是 OpenAPI 文档」可区分", () => {
    // 缩进错乱 → YAML 语法错误
    const syntax = expectFail("openapi: '3.0.0'\ninfo:\n  title: A\n bad: [1, 2\n", "syntax");
    expect(syntax.message).toContain("YAML 语法错误");

    // 语法合法但无版本字段 → 非文档
    const notDoc = expectFail("info:\n  title: A\npaths: {}\n", "not-openapi");
    expect(notDoc.message).toContain("无法识别的文档格式");
  });

  it("顶层不是对象报「不是文档」", () => {
    expectFail("[1, 2, 3]", "not-openapi");
  });

  it("超出体积上限被拒绝且提示上限值", () => {
    const huge = " ".repeat(MAX_DOC_CHARS) + "x";
    const err = expectFail(huge, "limit");
    expect(err.message).toContain("MB");
  });
});
