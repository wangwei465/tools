import { describe, it, expect } from "vitest";
import { classifyEsOperation, classifyMongoOperation, gateOperation } from "./safety";

describe("classifyEsOperation", () => {
  describe("只读", () => {
    it("GET 一律只读（ES 无带副作用的 GET 端点）", () => {
      expect(classifyEsOperation("GET", "/_cat/indices?format=json")).toMatchObject({
        write: false,
        dangerous: false,
      });
      expect(classifyEsOperation("GET", "/orders/_mapping")).toMatchObject({ write: false });
      expect(classifyEsOperation("HEAD", "/orders")).toMatchObject({ write: false });
    });

    it("POST 打到查询端点只读", () => {
      expect(classifyEsOperation("POST", "/orders/_search")).toMatchObject({
        write: false,
        dangerous: false,
      });
      expect(classifyEsOperation("POST", "/_msearch")).toMatchObject({ write: false });
      expect(classifyEsOperation("POST", "/orders/_count")).toMatchObject({ write: false });
    });
  });

  describe("写", () => {
    it("写入文档为写、非危险", () => {
      const cls = classifyEsOperation("PUT", "/orders/_doc/1");
      expect(cls.write).toBe(true);
      expect(cls.dangerous).toBe(false);
    });

    it("_update_by_query 为写、非危险", () => {
      const cls = classifyEsOperation("POST", "/orders/_update_by_query");
      expect(cls.write).toBe(true);
      expect(cls.dangerous).toBe(false);
    });

    it("删除单个文档为写、非危险", () => {
      const cls = classifyEsOperation("DELETE", "/orders/_doc/1");
      expect(cls.write).toBe(true);
      expect(cls.dangerous).toBe(false);
    });
  });

  describe("危险", () => {
    it("DELETE /{index} 删索引为危险", () => {
      const cls = classifyEsOperation("DELETE", "/orders");
      expect(cls).toMatchObject({ write: true, dangerous: true });
      expect(cls.reason).toContain("删除索引");
    });

    it("_all 是索引选择器而非子 API，DELETE /_all 仍判为删索引", () => {
      expect(classifyEsOperation("DELETE", "/_all")).toMatchObject({
        write: true,
        dangerous: true,
      });
    });

    it("_delete_by_query 为危险", () => {
      expect(classifyEsOperation("POST", "/orders/_delete_by_query")).toMatchObject({
        write: true,
        dangerous: true,
      });
    });

    it("_close 关闭索引为危险", () => {
      expect(classifyEsOperation("POST", "/orders/_close")).toMatchObject({
        write: true,
        dangerous: true,
      });
    });
  });

  it("方法大小写与路径首尾斜杠不敏感", () => {
    expect(classifyEsOperation("post", "orders/_search/")).toMatchObject({ write: false });
    expect(classifyEsOperation("delete", "orders")).toMatchObject({ dangerous: true });
  });
});

describe("classifyMongoOperation", () => {
  it("find / aggregate 只读", () => {
    expect(classifyMongoOperation("find", { a: 1 })).toMatchObject({
      write: false,
      dangerous: false,
    });
    expect(classifyMongoOperation("aggregate")).toMatchObject({ write: false, dangerous: false });
  });

  it("find 即便空过滤条件也只读（读取不受危险限制）", () => {
    expect(classifyMongoOperation("find", {})).toMatchObject({ write: false, dangerous: false });
  });

  it("drop / dropDatabase 为危险", () => {
    expect(classifyMongoOperation("drop")).toMatchObject({ write: true, dangerous: true });
    expect(classifyMongoOperation("dropDatabase")).toMatchObject({ write: true, dangerous: true });
  });

  // 空过滤条件升级为危险 —— 对照用例：同一操作，只有过滤条件不同
  describe("空过滤条件升级为危险", () => {
    it("deleteMany({}) 升级为危险并说明影响全部文档", () => {
      const cls = classifyMongoOperation("deleteMany", {});
      expect(cls).toMatchObject({ write: true, dangerous: true });
      expect(cls.reason).toContain("全部文档");
    });

    it("deleteMany({status:'x'}) 带条件不升级，为普通写", () => {
      expect(classifyMongoOperation("deleteMany", { status: "x" })).toMatchObject({
        write: true,
        dangerous: false,
      });
    });

    it("updateMany({}) 升级为危险", () => {
      expect(classifyMongoOperation("updateMany", {})).toMatchObject({
        write: true,
        dangerous: true,
      });
    });

    it("updateMany 带条件不升级", () => {
      expect(classifyMongoOperation("updateMany", { userId: 7 })).toMatchObject({
        write: true,
        dangerous: false,
      });
    });

    it("过滤条件缺失等同于空条件", () => {
      expect(classifyMongoOperation("deleteMany")).toMatchObject({ dangerous: true });
      expect(classifyMongoOperation("deleteMany", null)).toMatchObject({ dangerous: true });
    });
  });

  it("未知操作名保守按写处理", () => {
    expect(classifyMongoOperation("mapReduce")).toMatchObject({ write: true, dangerous: false });
  });
});

describe("gateOperation", () => {
  const rw = { name: "local-es", env: "local" as const, mode: "rw" as const };
  const ro = { name: "prod-es", env: "prod" as const, mode: "readonly" as const };

  it("只读连接放行只读操作", () => {
    const r = gateOperation({
      cls: classifyEsOperation("POST", "/orders/_search"),
      conn: ro,
      description: "POST /orders/_search",
    });
    expect(r.allowed).toBe(true);
  });

  it("只读连接拦截写操作并说明原因", () => {
    const r = gateOperation({
      cls: classifyEsOperation("POST", "/orders/_update_by_query"),
      conn: ro,
      description: "POST /orders/_update_by_query",
    });
    expect(r.allowed).toBe(false);
    expect(r.blocked).toBe("readonly");
    expect(r.error).toContain("只读模式");
  });

  it("读写连接上危险操作未确认时要求二次确认并回显操作", () => {
    const r = gateOperation({
      cls: classifyEsOperation("DELETE", "/orders"),
      conn: rw,
      description: "DELETE /orders",
    });
    expect(r.allowed).toBe(false);
    expect(r.needConfirm).toBe(true);
    expect(r.description).toBe("DELETE /orders");
  });

  it("确认后放行危险操作", () => {
    const r = gateOperation({
      cls: classifyEsOperation("DELETE", "/orders"),
      conn: rw,
      description: "DELETE /orders",
      confirm: true,
    });
    expect(r.allowed).toBe(true);
  });

  it("只读优先于确认：只读连接上的危险操作即便已确认也拦截", () => {
    const r = gateOperation({
      cls: classifyMongoOperation("drop"),
      conn: ro,
      description: "drop()",
      confirm: true,
    });
    expect(r.allowed).toBe(false);
    expect(r.blocked).toBe("readonly");
  });
});
