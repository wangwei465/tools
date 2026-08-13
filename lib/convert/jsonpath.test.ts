import { describe, it, expect } from "vitest";
import { evalJsonPath, MAX_JSON_LENGTH, MAX_RESULTS } from "./jsonpath";

/** 贴近真实场景的 ES 风格响应片段。 */
const ES = JSON.stringify({
  took: 0,
  hits: {
    total: { value: 2, relation: "eq" },
    hits: [
      { _index: "eh-diagnosis-2026", _id: "a1", _source: { id: "a1", score: 5, meta: { year: 2026 } } },
      { _index: "eh-diagnosis-2026", _id: "b2", _source: { id: "b2", score: 20, meta: { year: 2025 } } },
    ],
  },
});

describe("jsonpath 语法覆盖", () => {
  it("点路径取值", () => {
    const r = evalJsonPath('{"a":{"b":{"c":1}}}', "$.a.b.c");
    expect(r.ok).toBe(true);
    expect(r.value!.hits).toHaveLength(1);
    expect(r.value!.hits[0].value).toBe(1);
  });

  it("递归下降跨层级取值", () => {
    const r = evalJsonPath(ES, "$..id");
    expect(r.ok).toBe(true);
    expect(r.value!.hits.map((h) => h.value)).toEqual(["a1", "b2"]);
  });

  it("数组索引取值", () => {
    const r = evalJsonPath('{"hits":[{"x":1},{"x":2}]}', "$.hits[1].x");
    expect(r.ok).toBe(true);
    expect(r.value!.hits[0].value).toBe(2);
  });

  it("数组切片不含上界", () => {
    const r = evalJsonPath('{"list":[0,1,2,3,4]}', "$.list[0:2]");
    expect(r.ok).toBe(true);
    expect(r.value!.hits.map((h) => h.value)).toEqual([0, 1]);
  });

  it("通配符展开直接子节点", () => {
    const r = evalJsonPath('{"m":{"a":1,"b":2}}', "$.m.*");
    expect(r.ok).toBe(true);
    expect(r.value!.hits.map((h) => h.value)).toEqual([1, 2]);
  });

  it("过滤表达式（safe 模式下可用）", () => {
    const r = evalJsonPath(ES, "$..[?(@.score>10)]");
    expect(r.ok).toBe(true);
    expect(r.value!.hits).toHaveLength(1);
    expect((r.value!.hits[0].value as { id: string }).id).toBe("b2");
  });
});

describe("jsonpath 命中路径", () => {
  it("每个命中带回可定位的完整路径", () => {
    const r = evalJsonPath(ES, "$..id");
    expect(r.ok).toBe(true);
    expect(r.value!.hits.map((h) => h.path)).toEqual([
      "$['hits']['hits'][0]['_source']['id']",
      "$['hits']['hits'][1]['_source']['id']",
    ]);
  });

  it("根表达式路径为 $", () => {
    const r = evalJsonPath('{"a":1}', "$");
    expect(r.ok).toBe(true);
    expect(r.value!.hits[0].path).toBe("$");
  });
});

describe("jsonpath 错误分类", () => {
  it("非法 JSON 归为 JSON 错误，措辞不提表达式", () => {
    const r = evalJsonPath('{"a":', "$.a");
    expect(r.ok).toBe(false);
    expect(r.error).toContain("JSON 解析失败");
    expect(r.error).not.toContain("表达式");
  });

  it("非法表达式归为表达式错误，措辞不提 JSON 解析", () => {
    const r = evalJsonPath('{"a":1}', "$..[?(@.");
    expect(r.ok).toBe(false);
    expect(r.error).toContain("表达式");
    expect(r.error).not.toContain("JSON 解析失败");
  });

  it("零命中是成功结果而非错误", () => {
    const r = evalJsonPath(ES, "$.nope.deep");
    expect(r.ok).toBe(true);
    expect(r.value!.hits).toHaveLength(0);
    expect(r.value!.total).toBe(0);
    expect(r.error).toBeUndefined();
  });

  it("空 JSON 与空表达式分别提示", () => {
    expect(evalJsonPath("   ", "$.a").error).toContain("JSON");
    expect(evalJsonPath('{"a":1}', "  ").error).toContain("表达式");
  });

  it("任何非法输入都不抛异常", () => {
    const inputs: [string, string][] = [
      ["", ""],
      ["not json", "$["],
      ['{"a":1}', "@@@"],
      ["[1,2,3]", "$..[?(@"],
    ];
    for (const [j, p] of inputs) {
      expect(() => evalJsonPath(j, p)).not.toThrow();
      expect(evalJsonPath(j, p).ok).toBe(false);
    }
  });
});

describe("jsonpath 前置校验回归", () => {
  // 这些表达式库本身不报错：部分静默返回根文档（伪装成功），部分静默返回空（伪装零命中）。
  // 校验必须把它们判为非法，否则用户会被误导。见 design 决策 11。
  const silentlyRootOrEmpty = ["$[", "$.a[", "$.", "$..", "abc", '$["x', "$[0", "$.a)", "a.b.c", "$..a["];

  for (const expr of silentlyRootOrEmpty) {
    it(`拒绝非法表达式 ${JSON.stringify(expr)}`, () => {
      const r = evalJsonPath(ES, expr);
      expect(r.ok).toBe(false);
      expect(r.error).toContain("表达式");
    });
  }

  it("非法表达式 MUST NOT 静默返回根文档", () => {
    const r = evalJsonPath(ES, "$[");
    expect(r.ok).toBe(false);
    expect(r.value).toBeUndefined();
  });

  it("合法表达式不被误杀", () => {
    const valid = ["$", "$.hits", "$..id", "$.hits.hits[0]", "$.hits.hits[*]", "$.hits.hits[0:1]", "$..[?(@.score>10)]"];
    for (const expr of valid) {
      expect(evalJsonPath(ES, expr).ok).toBe(true);
    }
  });

  it("引号内的 [ 不计入括号配对，表达式得以放行", () => {
    // 校验层放行即达到目的。库本身不支持键名含 [ 的匹配（返回零命中），
    // 那是上游能力边界，不应由校验层提前拒绝——否则会把「库查不到」误报成「表达式写错了」。
    const r = evalJsonPath('{"a[b":1}', "$['a[b']");
    expect(r.ok).toBe(true);
    expect(r.value!.total).toBe(0);
  });

  it("引号路径可取含特殊字符的键名", () => {
    const r = evalJsonPath('{"a.b":1}', "$['a.b']");
    expect(r.ok).toBe(true);
    expect(r.value!.hits[0].value).toBe(1);
  });
});

describe("jsonpath 规模保护", () => {
  it("超长文档被拒并给出上限提示", () => {
    const huge = `{"pad":"${"x".repeat(MAX_JSON_LENGTH)}"}`;
    const r = evalJsonPath(huge, "$.pad");
    expect(r.ok).toBe(false);
    expect(r.error).toContain(String(MAX_JSON_LENGTH));
  });

  it("恰好在上限内的文档正常求值", () => {
    const doc = '{"a":1}';
    expect(doc.length).toBeLessThanOrEqual(MAX_JSON_LENGTH);
    expect(evalJsonPath(doc, "$.a").ok).toBe(true);
  });

  it("命中超限时截断并如实告知总数", () => {
    const list = Array.from({ length: MAX_RESULTS + 5 }, (_, i) => i);
    const r = evalJsonPath(JSON.stringify({ list }), "$.list[*]");
    expect(r.ok).toBe(true);
    expect(r.value!.hits).toHaveLength(MAX_RESULTS);
    expect(r.value!.truncated).toBe(true);
    expect(r.value!.total).toBe(MAX_RESULTS + 5);
  });

  it("命中未超限时不标记截断", () => {
    const r = evalJsonPath(ES, "$..id");
    expect(r.value!.truncated).toBe(false);
    expect(r.value!.total).toBe(2);
  });
});
