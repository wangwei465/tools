import { describe, it, expect } from "vitest";
import { readV3 } from "./read-v3";

const BASE = { openapi: "3.0.3", info: { title: "订单服务" } };

describe("readV3 服务器地址", () => {
  it("读取 servers 并去掉末尾斜杠", () => {
    const m = readV3({
      ...BASE,
      servers: [{ url: "https://api.example.com/v1/", description: "测试环境" }],
      paths: {},
    });
    expect(m.title).toBe("订单服务");
    expect(m.servers).toEqual([{ url: "https://api.example.com/v1", description: "测试环境" }]);
  });

  it("展开 server url 的 {var} 模板", () => {
    const m = readV3({
      ...BASE,
      servers: [
        { url: "https://{host}:{port}/api", variables: { host: { default: "a.cn" }, port: { default: 8080 } } },
      ],
      paths: {},
    });
    expect(m.servers[0].url).toBe("https://a.cn:8080/api");
  });

  it("无 servers 时为空列表", () => {
    expect(readV3({ ...BASE, paths: {} }).servers).toEqual([]);
  });
});

describe("readV3 操作提取", () => {
  const doc = {
    ...BASE,
    paths: {
      "/orders": {
        get: { tags: ["订单"], summary: "订单列表", operationId: "listOrders" },
        post: { tags: ["订单"], operationId: "createOrder" },
      },
      "/orders/{id}": {
        get: { summary: "订单详情" },
        // 非操作键一律忽略
        description: "订单资源",
        parameters: [],
      },
    },
  };

  it("按 path × method 展开，未知字段忽略", () => {
    const m = readV3(doc);
    expect(m.operations).toHaveLength(3);
    expect(m.operations.map((o) => `${o.method} ${o.path}`)).toEqual([
      "GET /orders",
      "POST /orders",
      "GET /orders/{id}",
    ]);
  });

  it("group 取第一个 tag，缺失为 null", () => {
    const m = readV3(doc);
    expect(m.operations[0].group).toBe("订单");
    expect(m.operations[2].group).toBeNull();
  });

  it("保留 summary 与 operationId 原样", () => {
    const m = readV3(doc);
    expect(m.operations[0].summary).toBe("订单列表");
    expect(m.operations[0].operationId).toBe("listOrders");
    expect(m.operations[1].summary).toBe("");
  });
});

describe("readV3 参数提取", () => {
  it("提取 query 与 header，忽略 path 与 cookie", () => {
    const m = readV3({
      ...BASE,
      paths: {
        "/u/{id}": {
          get: {
            parameters: [
              { name: "id", in: "path", schema: { type: "integer" } },
              { name: "page", in: "query", schema: { type: "integer", default: 1 } },
              { name: "kw", in: "query", schema: { type: "string" } },
              { name: "X-Trace", in: "header", schema: { type: "string" } },
              { name: "sid", in: "cookie", schema: { type: "string" } },
            ],
          },
        },
      },
    });
    const op = m.operations[0];
    expect(op.query).toEqual([
      { name: "page", value: "1" },
      { name: "kw", value: "string" },
    ]);
    expect(op.headers).toEqual([{ name: "X-Trace", value: "string" }]);
  });

  it("操作级参数覆盖 path 级同名参数", () => {
    const m = readV3({
      ...BASE,
      paths: {
        "/u": {
          parameters: [{ name: "page", in: "query", schema: { type: "integer", default: 1 } }],
          get: { parameters: [{ name: "page", in: "query", schema: { type: "integer", default: 9 } }] },
        },
      },
    });
    expect(m.operations[0].query).toEqual([{ name: "page", value: "9" }]);
  });

  it("解析参数上的 $ref", () => {
    const m = readV3({
      ...BASE,
      components: {
        parameters: { Page: { name: "page", in: "query", schema: { type: "integer", default: 2 } } },
      },
      paths: { "/u": { get: { parameters: [{ $ref: "#/components/parameters/Page" }] } } },
    });
    expect(m.operations[0].query).toEqual([{ name: "page", value: "2" }]);
  });

  it("参数级 example 优先于 schema", () => {
    const m = readV3({
      ...BASE,
      paths: {
        "/u": { get: { parameters: [{ name: "kw", in: "query", example: "钢笔", schema: { type: "string" } }] } },
      },
    });
    expect(m.operations[0].query).toEqual([{ name: "kw", value: "钢笔" }]);
  });
});

describe("readV3 请求体", () => {
  const doc = {
    ...BASE,
    components: {
      schemas: {
        OrderReq: {
          type: "object",
          properties: { sku: { type: "string" }, qty: { type: "integer", default: 1 } },
        },
      },
    },
    paths: {
      "/orders": {
        post: {
          requestBody: {
            content: { "application/json": { schema: { $ref: "#/components/schemas/OrderReq" } } },
          },
        },
        get: {},
      },
      "/upload": {
        post: { requestBody: { content: { "multipart/form-data": { schema: { type: "object" } } } } },
      },
    },
  };

  it("由 requestBody.content 的 JSON schema 生成示例", () => {
    const m = readV3(doc);
    const post = m.operations.find((o) => o.method === "POST" && o.path === "/orders")!;
    expect(JSON.parse(post.bodyRaw!)).toEqual({ sku: "string", qty: 1 });
  });

  it("无 requestBody 的操作 bodyRaw 为 null", () => {
    const get = readV3(doc).operations.find((o) => o.method === "GET")!;
    expect(get.bodyRaw).toBeNull();
  });

  it("非 JSON 内容类型降级为空 body 并记 issue", () => {
    const m = readV3(doc);
    const upload = m.operations.find((o) => o.path === "/upload")!;
    expect(upload.bodyRaw).toBeNull();
    expect(m.issues.map((i) => i.type)).toContain("body-unsupported");
  });

  it("requestBody 本身是 $ref 时先展开", () => {
    const m = readV3({
      ...BASE,
      components: {
        requestBodies: { R: { content: { "application/json": { schema: { type: "object", properties: { a: { type: "boolean" } } } } } } },
      },
      paths: { "/x": { post: { requestBody: { $ref: "#/components/requestBodies/R" } } } },
    });
    expect(JSON.parse(m.operations[0].bodyRaw!)).toEqual({ a: false });
  });
});

describe("readV3 安全方案", () => {
  const withScheme = (schemes: Record<string, unknown>, security?: unknown) => ({
    ...BASE,
    components: { securitySchemes: schemes },
    ...(security ? { security } : {}),
    paths: { "/x": { get: {} } },
  });

  it("映射 http bearer", () => {
    const m = readV3(withScheme({ bt: { type: "http", scheme: "bearer" } }, [{ bt: [] }]));
    expect(m.operations[0].auth).toEqual({ kind: "bearer" });
  });

  it("映射 http basic", () => {
    const m = readV3(withScheme({ b: { type: "http", scheme: "basic" } }, [{ b: [] }]));
    expect(m.operations[0].auth).toEqual({ kind: "basic" });
  });

  it("映射 apiKey，保留键名与位置", () => {
    const m = readV3(withScheme({ k: { type: "apiKey", name: "X-Token", in: "header" } }, [{ k: [] }]));
    expect(m.operations[0].auth).toEqual({ kind: "apikey", name: "X-Token", in: "header" });
  });

  it("OAuth2 无法映射：不设 Auth 并记 issue", () => {
    const m = readV3(withScheme({ oa: { type: "oauth2", flows: {} } }, [{ oa: [] }]));
    expect(m.operations[0].auth).toEqual({ kind: "none" });
    expect(m.issues.map((i) => i.type)).toContain("auth-unmappable");
  });

  it("未声明 security 但只定义了一个方案时沿用该方案", () => {
    const m = readV3(withScheme({ bt: { type: "http", scheme: "bearer" } }));
    expect(m.operations[0].auth).toEqual({ kind: "bearer" });
  });

  it("操作级 security 覆盖文档级", () => {
    const m = readV3({
      ...BASE,
      components: {
        securitySchemes: {
          bt: { type: "http", scheme: "bearer" },
          k: { type: "apiKey", name: "X-K", in: "query" },
        },
      },
      security: [{ bt: [] }],
      paths: { "/x": { get: { security: [{ k: [] }] }, post: {} } },
    });
    expect(m.operations[0].auth).toEqual({ kind: "apikey", name: "X-K", in: "query" });
    expect(m.operations[1].auth).toEqual({ kind: "bearer" });
  });

  it("无安全方案时为 none", () => {
    const m = readV3({ ...BASE, paths: { "/x": { get: {} } } });
    expect(m.operations[0].auth).toEqual({ kind: "none" });
  });
});
