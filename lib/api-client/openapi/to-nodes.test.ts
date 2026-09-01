import { describe, it, expect } from "vitest";
import { buildImportPlan, groupOf, nodeNameOf, resolvePlanNames, uniqueName } from "./to-nodes";
import { parseToPlan } from "./index";
import type { ApiDocModel, ApiOperation } from "./types";

function op(patch: Partial<ApiOperation> = {}): ApiOperation {
  return {
    method: "GET",
    path: "/x",
    group: null,
    summary: "",
    operationId: "",
    query: [],
    headers: [],
    bodyRaw: null,
    auth: { kind: "none" },
    ...patch,
  };
}

function model(patch: Partial<ApiDocModel> = {}): ApiDocModel {
  return { title: "订单服务", servers: [], operations: [], issues: [], ...patch };
}

describe("分组三级回退", () => {
  it("有 tag 时用第一个 tag", () => {
    expect(groupOf(op({ group: "订单", path: "/user/list" }))).toBe("订单");
  });

  it("无 tag 时取 path 首段", () => {
    expect(groupOf(op({ path: "/user/list" }))).toBe("user");
  });

  it("跳过 api / v1 等通用前缀", () => {
    expect(groupOf(op({ path: "/api/v1/user/list" }))).toBe("user");
    expect(groupOf(op({ path: "/rest/v2/order" }))).toBe("order");
    expect(groupOf(op({ path: "/services/app/product/get" }))).toBe("product");
  });

  it("跳过路径参数段", () => {
    expect(groupOf(op({ path: "/{tenant}/user/list" }))).toBe("user");
  });

  it("取不出有意义的段时归入未分类", () => {
    expect(groupOf(op({ path: "/api/v1" }))).toBe("未分类");
    expect(groupOf(op({ path: "/" }))).toBe("未分类");
    expect(groupOf(op({ path: "/{id}" }))).toBe("未分类");
  });
});

describe("节点名三级回退", () => {
  it("优先 summary", () => {
    expect(nodeNameOf(op({ summary: "订单列表", operationId: "listOrders" }))).toBe("订单列表");
  });

  it("次选 operationId", () => {
    expect(nodeNameOf(op({ operationId: "listOrders" }))).toBe("listOrders");
  });

  it("兜底 method + path", () => {
    expect(nodeNameOf(op({ method: "DELETE", path: "/orders/{id}" }))).toBe("DELETE /orders/{id}");
  });
});

describe("uniqueName", () => {
  it("不冲突时原样返回", () => {
    expect(uniqueName("A", [])).toBe("A");
  });

  it("冲突时依次加后缀", () => {
    expect(uniqueName("A", ["A"])).toBe("A (2)");
    expect(uniqueName("A", ["A", "A (2)"])).toBe("A (3)");
  });
});

describe("请求定义构造", () => {
  it("URL 以 {{baseUrl}} 为前缀且保留路径参数原样", () => {
    const plan = buildImportPlan(model({ operations: [op({ path: "/users/{id}", group: "用户" })] }));
    expect(plan.groups[0].requests[0].definition.url).toBe("{{baseUrl}}/users/{id}");
  });

  it("query 参数同时写入 URL 与 params 视图", () => {
    const plan = buildImportPlan(
      model({
        operations: [
          op({ path: "/users", group: "用户", query: [{ name: "page", value: "1" }, { name: "kw", value: "" }] }),
        ],
      })
    );
    const d = plan.groups[0].requests[0].definition;
    expect(d.url).toBe("{{baseUrl}}/users?page=1&kw=");
    expect(d.params).toEqual([
      { key: "page", value: "1", enabled: true },
      { key: "kw", value: "", enabled: true },
    ]);
  });

  it("header 参数转为 headers 行", () => {
    const plan = buildImportPlan(
      model({ operations: [op({ group: "g", headers: [{ name: "X-Trace", value: "string" }] })] })
    );
    expect(plan.groups[0].requests[0].definition.headers).toEqual([
      { key: "X-Trace", value: "string", enabled: true },
    ]);
  });

  it("有请求体时 body 为 raw，无则为 none", () => {
    const plan = buildImportPlan(
      model({
        operations: [
          op({ method: "POST", group: "g", bodyRaw: '{\n  "a": 1\n}' }),
          op({ method: "GET", group: "g" }),
        ],
      })
    );
    const [post, get] = plan.groups[0].requests;
    expect(post.definition.body.type).toBe("raw");
    expect(post.definition.body.raw).toBe('{\n  "a": 1\n}');
    expect(get.definition.body.type).toBe("none");
  });

  it("安全方案映射到 Auth 配置", () => {
    const plan = buildImportPlan(
      model({
        operations: [
          op({ group: "g", auth: { kind: "bearer" } }),
          op({ group: "g", auth: { kind: "basic" } }),
          op({ group: "g", auth: { kind: "apikey", name: "X-Token", in: "query" } }),
        ],
      })
    );
    const [a, b, c] = plan.groups[0].requests.map((r) => r.definition.auth);
    expect(a.type).toBe("bearer");
    expect(b.type).toBe("basic");
    expect(c.type).toBe("apikey");
    expect(c.apiKeyName).toBe("X-Token");
    expect(c.apiKeyIn).toBe("query");
  });
});

describe("环境与变量构造", () => {
  it("每个 server 生成一个环境，名取 description", () => {
    const plan = buildImportPlan(
      model({
        servers: [
          { url: "https://test.example.com", description: "测试环境" },
          { url: "https://prod.example.com", description: "生产环境" },
        ],
      })
    );
    expect(plan.environments).toEqual([
      { name: "测试环境", baseUrl: "https://test.example.com" },
      { name: "生产环境", baseUrl: "https://prod.example.com" },
    ]);
  });

  it("description 缺失时取 host", () => {
    const plan = buildImportPlan(model({ servers: [{ url: "https://api.example.com/v1", description: "" }] }));
    expect(plan.environments[0].name).toBe("api.example.com");
  });

  it("文档内同名的服务器互不覆盖，后者加后缀", () => {
    const plan = buildImportPlan(
      model({
        servers: [
          { url: "https://a.cn", description: "环境" },
          { url: "https://b.cn", description: "环境" },
        ],
      })
    );
    expect(plan.environments.map((e) => e.name)).toEqual(["环境", "环境 (2)"]);
  });

  it("无服务器地址时不建环境并记 issue", () => {
    const plan = buildImportPlan(model({ operations: [op({ group: "g" })] }));
    expect(plan.environments).toEqual([]);
    expect(plan.issues.map((i) => i.type)).toContain("no-server");
    // URL 仍以 {{baseUrl}} 为前缀
    expect(plan.groups[0].requests[0].definition.url.startsWith("{{baseUrl}}")).toBe(true);
  });
});

describe("重名消解", () => {
  const plan = buildImportPlan(
    model({ title: "订单服务", servers: [{ url: "https://a.cn", description: "测试环境" }] })
  );

  it("无冲突时沿用原名", () => {
    const r = resolvePlanNames(plan, { rootFolderNames: ["其他"], envNames: [] });
    expect(r.rootName).toBe("订单服务");
    expect(r.rootIsCopy).toBe(false);
    expect(r.environments[0]).toEqual({ name: "测试环境", baseUrl: "https://a.cn", renamedFrom: null });
  });

  it("根文件夹重名时新建副本", () => {
    const r = resolvePlanNames(plan, { rootFolderNames: ["订单服务"], envNames: [] });
    expect(r.rootName).toBe("订单服务 (2)");
    expect(r.rootIsCopy).toBe(true);
  });

  it("环境重名时改用带后缀名称，既有环境不被覆盖", () => {
    const r = resolvePlanNames(plan, { rootFolderNames: [], envNames: ["测试环境", "测试环境 (2)"] });
    expect(r.environments[0]).toEqual({
      name: "测试环境 (3)",
      baseUrl: "https://a.cn",
      renamedFrom: "测试环境",
    });
  });
});

describe("降级项与预览统计", () => {
  it("统计无 tag 的接口数", () => {
    const plan = buildImportPlan(
      model({ operations: [op({ path: "/user/a" }), op({ path: "/user/b" }), op({ group: "订单" })] })
    );
    const issue = plan.issues.find((i) => i.type === "missing-tag")!;
    expect(issue.message).toContain("2 个接口");
  });

  it("统计含路径参数的请求数", () => {
    const plan = buildImportPlan(
      model({ operations: [op({ path: "/u/{id}", group: "g" }), op({ path: "/u", group: "g" })] })
    );
    const issue = plan.issues.find((i) => i.type === "path-param")!;
    expect(issue.message).toContain("1 个请求");
    expect(issue.where).toBe("GET /u/{id}");
  });

  it("无降级时 issues 只含读取器结果", () => {
    const plan = buildImportPlan(
      model({ servers: [{ url: "https://a.cn", description: "" }], operations: [op({ group: "订单" })] })
    );
    expect(plan.issues).toEqual([]);
  });

  it("预览统计包含根文件夹", () => {
    const plan = buildImportPlan(
      model({
        servers: [{ url: "https://a.cn", description: "" }],
        operations: [op({ group: "A" }), op({ group: "B" }), op({ group: "B" })],
      })
    );
    expect(plan.stats).toEqual({ folders: 3, requests: 3 });
    expect(plan.groups.map((g) => g.name)).toEqual(["A", "B"]);
  });

  it("title 缺失时根文件夹兜底命名", () => {
    expect(buildImportPlan(model({ title: "" })).rootName).toBe("未命名服务");
  });
});

describe("parseToPlan 端到端", () => {
  it("由 3.x 文档直接产出可用计划", () => {
    const text = JSON.stringify({
      openapi: "3.0.1",
      info: { title: "用户服务" },
      servers: [{ url: "https://api.example.com/v1", description: "测试环境" }],
      paths: {
        "/users/{id}": {
          get: { tags: ["用户"], summary: "用户详情" },
        },
      },
    });
    const { version, plan } = parseToPlan(text);
    expect(version).toBe("3.0");
    expect(plan.rootName).toBe("用户服务");
    expect(plan.groups).toHaveLength(1);
    expect(plan.groups[0].name).toBe("用户");
    expect(plan.groups[0].requests[0].name).toBe("用户详情");
    expect(plan.groups[0].requests[0].definition.url).toBe("{{baseUrl}}/users/{id}");
    expect(plan.environments).toEqual([{ name: "测试环境", baseUrl: "https://api.example.com/v1" }]);
    expect(plan.issues.map((i) => i.type)).toEqual(["path-param"]);
  });

  it("YAML 输入产出同样的计划", () => {
    const yamlText = [
      "openapi: '3.0.1'",
      "info:",
      "  title: 用户服务",
      "paths:",
      "  /users:",
      "    get:",
      "      tags: [用户]",
      "      summary: 用户列表",
    ].join("\n");
    const { plan } = parseToPlan(yamlText);
    expect(plan.rootName).toBe("用户服务");
    expect(plan.groups[0].requests[0].name).toBe("用户列表");
  });

  it("循环引用文档在有限步内完成解析", () => {
    const text = JSON.stringify({
      openapi: "3.0.1",
      info: { title: "树服务" },
      components: {
        schemas: {
          Node: {
            type: "object",
            properties: { id: { type: "integer" }, child: { $ref: "#/components/schemas/Node" } },
          },
        },
      },
      paths: {
        "/tree": {
          post: {
            tags: ["树"],
            requestBody: {
              content: { "application/json": { schema: { $ref: "#/components/schemas/Node" } } },
            },
          },
        },
      },
    });
    const { plan } = parseToPlan(text);
    // Node 展开一层后，child 再次指回 Node 时被引用栈截断为 null
    expect(JSON.parse(plan.groups[0].requests[0].definition.body.raw)).toEqual({
      id: 0,
      child: null,
    });
    expect(plan.issues.map((i) => i.type)).toContain("ref-cycle");
  });
});
