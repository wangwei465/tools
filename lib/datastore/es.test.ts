import { describe, it, expect } from "vitest";
import {
  describeEsError,
  joinEsUrl,
  parseCatIndices,
  parseHitsTotal,
  parseMapping,
  parseSearchResponse,
} from "./es";

describe("joinEsUrl", () => {
  it("容忍 base 与 path 两侧的斜杠", () => {
    expect(joinEsUrl("http://es:9200/", "/orders/_search")).toBe("http://es:9200/orders/_search");
    expect(joinEsUrl("http://es:9200", "orders/_search")).toBe("http://es:9200/orders/_search");
    expect(joinEsUrl("http://es:9200/", "/")).toBe("http://es:9200/");
  });
});

describe("parseCatIndices", () => {
  it("解析索引行，缺列按空值兜底", () => {
    const rows = [
      { index: "orders", health: "green", status: "open", "docs.count": "1234", "store.size": "1.2mb" },
      { index: "logs" },
    ];
    expect(parseCatIndices(rows)).toEqual([
      { index: "orders", health: "green", status: "open", docsCount: 1234, storeSize: "1.2mb" },
      { index: "logs", health: "", status: "", docsCount: 0, storeSize: "" },
    ]);
  });

  it("非数组或无索引名的行被丢弃", () => {
    expect(parseCatIndices(null)).toEqual([]);
    expect(parseCatIndices({ index: "x" })).toEqual([]);
    expect(parseCatIndices([{ health: "green" }])).toEqual([]);
  });
});

describe("parseMapping 跨版本", () => {
  // 7.x+：mappings 下直接是 properties
  const v7 = {
    orders: {
      mappings: {
        properties: {
          orderId: { type: "keyword" },
          buyer: {
            properties: {
              name: { type: "text" },
              age: { type: "integer" },
            },
          },
          items: {
            type: "nested",
            properties: { sku: { type: "keyword" } },
          },
        },
      },
    },
  };

  // 6.x：mappings 下先有一层 mapping type
  const v6 = {
    orders: {
      mappings: {
        _doc: {
          properties: {
            orderId: { type: "keyword" },
            buyer: {
              properties: {
                name: { type: "text" },
                age: { type: "integer" },
              },
            },
            items: {
              type: "nested",
              properties: { sku: { type: "keyword" } },
            },
          },
        },
      },
    },
  };

  it("两种版本的响应解析结果一致", () => {
    expect(parseMapping(v6, "orders")).toEqual(parseMapping(v7, "orders"));
  });

  it("嵌套字段展开为树并保留层级与类型", () => {
    const fields = parseMapping(v7, "orders");
    const buyer = fields.find((f) => f.name === "buyer");
    expect(buyer?.type).toBe("object"); // 无显式 type 但有 properties → 隐式 object
    expect(buyer?.children?.map((c) => c.path)).toEqual(["buyer.age", "buyer.name"]);

    const items = fields.find((f) => f.name === "items");
    expect(items?.type).toBe("nested");
    expect(items?.children?.[0]).toMatchObject({ path: "items.sku", type: "keyword" });
  });

  it("响应键与请求索引名不一致时取第一个键（别名 / 通配符）", () => {
    const byAlias = { "orders-2026.08": { mappings: { properties: { a: { type: "long" } } } } };
    expect(parseMapping(byAlias, "orders-*").map((f) => f.name)).toEqual(["a"]);
  });

  it("无 mapping 时返回空数组而非报错", () => {
    expect(parseMapping({ orders: { mappings: {} } }, "orders")).toEqual([]);
    expect(parseMapping(null, "orders")).toEqual([]);
    expect(parseMapping("not json", "orders")).toEqual([]);
  });
});

describe("parseHitsTotal 跨版本", () => {
  it("识别数字形式（7.x 前）", () => {
    expect(parseHitsTotal(42)).toEqual({ value: 42, relation: "eq" });
  });

  it("识别 {value, relation} 形式（7.x 后）", () => {
    expect(parseHitsTotal({ value: 10000, relation: "gte" })).toEqual({
      value: 10000,
      relation: "gte",
    });
  });

  it("无法识别时返回 null", () => {
    expect(parseHitsTotal(undefined)).toBeNull();
    expect(parseHitsTotal({ relation: "eq" })).toBeNull();
  });
});

describe("parseSearchResponse", () => {
  const hits = [
    { _id: "1", _index: "orders", _source: { amount: 10 } },
    { _id: "2", _index: "orders", _source: { amount: 20, memo: "x" } },
  ];

  it("两种版本的 total 形状解析出相同总数", () => {
    const old = parseSearchResponse({ took: 5, hits: { total: 2, hits } });
    const modern = parseSearchResponse({ took: 5, hits: { total: { value: 2, relation: "eq" }, hits } });
    expect(old.total).toBe(2);
    expect(modern.total).toBe(2);
    expect(old.docs).toEqual(modern.docs);
  });

  it("文档附带 _id / _index 便于核对", () => {
    const r = parseSearchResponse({ took: 3, hits: { total: { value: 2 }, hits } });
    expect(r.parsed).toBe(true);
    expect(r.tookMs).toBe(3);
    expect(r.docs[0]).toEqual({ _id: "1", _index: "orders", amount: 10 });
  });

  it("relation=gte 原样保留（命中数为下限而非精确值）", () => {
    const r = parseSearchResponse({ hits: { total: { value: 10000, relation: "gte" }, hits: [] } });
    expect(r.relation).toBe("gte");
  });

  it("无法解析时 parsed=false 并回落原始 JSON", () => {
    const body = { acknowledged: true };
    const r = parseSearchResponse(body);
    expect(r.parsed).toBe(false);
    expect(r.raw).toBe(body);
    expect(r.docs).toEqual([]);
  });

  it("hits.hits 不是数组时也回落", () => {
    expect(parseSearchResponse({ hits: { total: 1, hits: "oops" } }).parsed).toBe(false);
  });
});

describe("describeEsError", () => {
  it("深分页触顶给出可读出路而非底层错误", () => {
    const body = {
      error: {
        type: "search_phase_execution_exception",
        reason: "all shards failed",
        caused_by: { reason: "Result window is too large, from + size must be less than 10000" },
      },
    };
    const msg = describeEsError(500, body);
    expect(msg).toContain("深分页上限");
    expect(msg).toContain("search_after");
    expect(msg).not.toContain("shards failed");
  });

  it("认证失败可读", () => {
    expect(describeEsError(401, { error: { type: "security_exception", reason: "unauthorized" } })).toContain(
      "认证失败"
    );
  });

  it("抽取 reason 与 caused_by", () => {
    const msg = describeEsError(400, {
      error: { type: "parsing_exception", reason: "unknown query [matchh]" },
    });
    expect(msg).toContain("parsing_exception");
    expect(msg).toContain("unknown query");
  });

  it("形状不认识时回落 JSON 片段", () => {
    expect(describeEsError(500, { weird: 1 })).toContain("weird");
  });
});
