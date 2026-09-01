import { describe, it, expect } from "vitest";
import { readV2 } from "./read-v2";
import { readV3 } from "./read-v3";

const BASE = { swagger: "2.0", info: { title: "订单服务" } };

describe("readV2 服务器地址", () => {
  it("由 schemes + host + basePath 组装", () => {
    const m = readV2({ ...BASE, host: "api.example.com", basePath: "/v1", schemes: ["https"], paths: {} });
    expect(m.servers).toEqual([{ url: "https://api.example.com/v1", description: "" }]);
  });

  it("basePath 末尾斜杠被去掉", () => {
    const m = readV2({ ...BASE, host: "a.cn", basePath: "/", schemes: ["http"], paths: {} });
    expect(m.servers[0].url).toBe("http://a.cn");
  });

  it("多协议各生成一项，描述带 scheme 以免重名", () => {
    const m = readV2({ ...BASE, host: "a.cn", schemes: ["http", "https"], paths: {} });
    expect(m.servers).toEqual([
      { url: "http://a.cn", description: "a.cn (http)" },
      { url: "https://a.cn", description: "a.cn (https)" },
    ]);
  });

  it("缺 schemes 时按 http 兜底", () => {
    const m = readV2({ ...BASE, host: "a.cn", basePath: "/api", paths: {} });
    expect(m.servers).toEqual([{ url: "http://a.cn/api", description: "" }]);
  });

  it("缺 host 时无服务器地址", () => {
    expect(readV2({ ...BASE, basePath: "/v1", paths: {} }).servers).toEqual([]);
  });
});

describe("readV2 操作与参数", () => {
  const doc = {
    ...BASE,
    paths: {
      "/orders": {
        get: {
          tags: ["订单"],
          summary: "订单列表",
          operationId: "listOrders",
          parameters: [
            { name: "page", in: "query", type: "integer", default: 1 },
            { name: "status", in: "query", type: "string", enum: ["NEW", "PAID"] },
            { name: "X-Trace", in: "header", type: "string" },
          ],
        },
      },
      "/orders/{id}": {
        get: { parameters: [{ name: "id", in: "path", type: "integer" }] },
      },
    },
  };

  it("提取 query / header，忽略 path", () => {
    const op = readV2(doc).operations[0];
    expect(op.query).toEqual([
      { name: "page", value: "1" },
      { name: "status", value: "NEW" },
    ]);
    expect(op.headers).toEqual([{ name: "X-Trace", value: "string" }]);
    expect(readV2(doc).operations[1].query).toEqual([]);
  });

  it("group 取第一个 tag，缺失为 null", () => {
    const m = readV2(doc);
    expect(m.operations[0].group).toBe("订单");
    expect(m.operations[1].group).toBeNull();
  });
});

describe("readV2 请求体", () => {
  it("由 in: body 参数的 schema 生成示例", () => {
    const m = readV2({
      ...BASE,
      definitions: {
        OrderReq: { type: "object", properties: { sku: { type: "string" }, qty: { type: "integer", default: 1 } } },
      },
      paths: {
        "/orders": {
          post: { parameters: [{ name: "body", in: "body", schema: { $ref: "#/definitions/OrderReq" } }] },
        },
      },
    });
    expect(JSON.parse(m.operations[0].bodyRaw!)).toEqual({ sku: "string", qty: 1 });
  });

  it("formData 参数降级为空 body 并记 issue", () => {
    const m = readV2({
      ...BASE,
      paths: { "/upload": { post: { parameters: [{ name: "file", in: "formData", type: "file" }] } } },
    });
    expect(m.operations[0].bodyRaw).toBeNull();
    expect(m.issues.map((i) => i.type)).toContain("body-unsupported");
  });

  it("无请求体参数时 bodyRaw 为 null 且不记 issue", () => {
    const m = readV2({ ...BASE, paths: { "/x": { get: {} } } });
    expect(m.operations[0].bodyRaw).toBeNull();
    expect(m.issues).toHaveLength(0);
  });
});

describe("readV2 安全方案", () => {
  it("映射 2.0 的 basic", () => {
    const m = readV2({
      ...BASE,
      securityDefinitions: { b: { type: "basic" } },
      security: [{ b: [] }],
      paths: { "/x": { get: {} } },
    });
    expect(m.operations[0].auth).toEqual({ kind: "basic" });
  });

  it("映射 apiKey", () => {
    const m = readV2({
      ...BASE,
      securityDefinitions: { k: { type: "apiKey", name: "Authorization", in: "header" } },
      paths: { "/x": { get: {} } },
    });
    expect(m.operations[0].auth).toEqual({ kind: "apikey", name: "Authorization", in: "header" });
  });

  it("oauth2 无法映射并记 issue", () => {
    const m = readV2({
      ...BASE,
      securityDefinitions: { oa: { type: "oauth2", flow: "implicit" } },
      security: [{ oa: [] }],
      paths: { "/x": { get: {} } },
    });
    expect(m.operations[0].auth).toEqual({ kind: "none" });
    expect(m.issues.map((i) => i.type)).toContain("auth-unmappable");
  });
});

/* ─── 3.6 跨版本对照：同一组接口的两份描述归一化后语义一致 ─── */

const V2_DOC = {
  swagger: "2.0",
  info: { title: "订单服务" },
  host: "api.example.com",
  basePath: "/v1",
  schemes: ["https"],
  securityDefinitions: { auth: { type: "apiKey", name: "X-Token", in: "header" } },
  security: [{ auth: [] }],
  definitions: {
    OrderReq: { type: "object", properties: { sku: { type: "string" }, qty: { type: "integer", default: 1 } } },
  },
  paths: {
    "/orders": {
      get: {
        tags: ["订单"],
        summary: "订单列表",
        operationId: "listOrders",
        parameters: [
          { name: "page", in: "query", type: "integer", default: 1 },
          { name: "X-Trace", in: "header", type: "string" },
        ],
      },
      post: {
        tags: ["订单"],
        summary: "创建订单",
        operationId: "createOrder",
        parameters: [{ name: "body", in: "body", schema: { $ref: "#/definitions/OrderReq" } }],
      },
    },
    "/orders/{id}": {
      delete: { tags: ["订单"], summary: "删除订单", operationId: "deleteOrder" },
    },
  },
};

const V3_DOC = {
  openapi: "3.0.3",
  info: { title: "订单服务" },
  servers: [{ url: "https://api.example.com/v1" }],
  components: {
    securitySchemes: { auth: { type: "apiKey", name: "X-Token", in: "header" } },
    schemas: {
      OrderReq: { type: "object", properties: { sku: { type: "string" }, qty: { type: "integer", default: 1 } } },
    },
  },
  security: [{ auth: [] }],
  paths: {
    "/orders": {
      get: {
        tags: ["订单"],
        summary: "订单列表",
        operationId: "listOrders",
        parameters: [
          { name: "page", in: "query", schema: { type: "integer", default: 1 } },
          { name: "X-Trace", in: "header", schema: { type: "string" } },
        ],
      },
      post: {
        tags: ["订单"],
        summary: "创建订单",
        operationId: "createOrder",
        requestBody: { content: { "application/json": { schema: { $ref: "#/components/schemas/OrderReq" } } } },
      },
    },
    "/orders/{id}": {
      delete: { tags: ["订单"], summary: "删除订单", operationId: "deleteOrder" },
    },
  },
};

describe("跨版本归一化一致性", () => {
  it("同一组接口的 2.0 与 3.x 描述产出等价的 ApiDocModel", () => {
    const a = readV2(V2_DOC);
    const b = readV3(V3_DOC);
    expect(a.title).toBe(b.title);
    expect(a.servers.map((s) => s.url)).toEqual(b.servers.map((s) => s.url));
    expect(a.operations).toEqual(b.operations);
    expect(a.issues).toEqual([]);
    expect(b.issues).toEqual([]);
  });
});
