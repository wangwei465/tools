import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { RequestDraft } from "@/components/api-client/types";
import { emptyRequest } from "@/components/api-client/types";

/**
 * 导入端点与写入事务的测试。
 *
 * `getDb()` 依 `process.cwd()/data/app.db` 建库且结果被缓存，故只在触发首次
 * 初始化的那一次调用上拦截 cwd，把库落到临时目录——dev 库含真实业务数据，
 * 测试绝不能碰。（worker 中 `process.chdir()` 不可用，只能走这条路。）
 */

let tmpDir = "";
let db: typeof import("@/lib/db");
let POST: (req: Request) => Promise<Response>;

beforeAll(async () => {
  tmpDir = mkdtempSync(path.join(tmpdir(), "tools-import-"));
  db = await import("@/lib/db");
  POST = (await import("./route")).POST;

  const cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(tmpDir);
  db.listNodes(); // 触发 getDb()：此刻建库并跑迁移，之后实例被缓存
  cwdSpy.mockRestore();
});

afterAll(() => {
  // Windows 上句柄未释放无法删文件；经 lib/db 的实例缓存钩子关掉连接
  (globalThis as { __appDb?: { close(): void } }).__appDb?.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

function draft(url: string): RequestDraft {
  return { ...emptyRequest(), method: "GET", url };
}

function payload(rootName = "订单服务") {
  return {
    rootName,
    groups: [
      {
        name: "订单",
        requests: [
          { name: "订单列表", definition: draft("{{baseUrl}}/orders") },
          { name: "订单详情", definition: draft("{{baseUrl}}/orders/{id}") },
        ],
      },
      { name: "用户", requests: [{ name: "用户列表", definition: draft("{{baseUrl}}/users") }] },
    ],
    environments: [{ name: "测试环境", baseUrl: "https://test.example.com" }],
  };
}

/** 当前库的完整快照，用于比对回滚前后是否一致。 */
function snapshot() {
  return JSON.stringify({
    nodes: db.listNodes(),
    envs: db.listEnvironments(),
    vars: db.listVariables(),
  });
}

function post(body: unknown): Promise<Response> {
  return POST(
    new Request("http://localhost/api/collections/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  );
}

describe("importCollection 写入", () => {
  it("一次性写入文件夹、请求、环境与变量", () => {
    const r = db.importCollection(payload());
    expect(r.rootName).toBe("订单服务");
    expect(r.rootIsCopy).toBe(false);
    expect(r.folders).toBe(3); // 根 + 两个分组
    expect(r.requests).toBe(3);

    const nodes = db.listNodes();
    const root = nodes.find((n) => n.id === r.rootId)!;
    expect(root.type).toBe("folder");
    expect(root.parentId).toBeNull();

    const groups = nodes.filter((n) => n.parentId === r.rootId);
    expect(groups.map((g) => g.name)).toEqual(["订单", "用户"]);

    const orderReqs = nodes.filter((n) => n.parentId === groups[0].id);
    expect(orderReqs.map((n) => n.name)).toEqual(["订单列表", "订单详情"]);
    expect(orderReqs[0].definition?.url).toBe("{{baseUrl}}/orders");

    const env = db.listEnvironments().find((e) => e.id === r.environments[0].id)!;
    expect(env.name).toBe("测试环境");
    expect(env.isActive).toBe(false);
    const vars = db.listVariables().filter((v) => v.envId === env.id);
    expect(vars).toHaveLength(1);
    expect(vars[0]).toMatchObject({ key: "baseUrl", value: "https://test.example.com", enabled: true });
  });

  it("重复导入新建副本，既有集合与环境不受影响", () => {
    const before = db.listNodes().filter((n) => n.parentId === null).length;
    const r = db.importCollection(payload());

    expect(r.rootIsCopy).toBe(true);
    expect(r.rootName).toBe("订单服务 (2)");
    expect(r.environments[0].name).toBe("测试环境 (2)");
    expect(r.environments[0].renamedFrom).toBe("测试环境");

    expect(db.listNodes().filter((n) => n.parentId === null)).toHaveLength(before + 1);
    // 既有环境的变量原样保留
    const first = db.listEnvironments().find((e) => e.name === "测试环境")!;
    expect(db.listVariables().filter((v) => v.envId === first.id)[0].value).toBe(
      "https://test.example.com"
    );
  });

  it("既有请求的用户改动在重复导入后保持不变", () => {
    const target = db.listNodes().find((n) => n.name === "订单列表")!;
    db.updateNodeDefinition(target.id, draft("{{baseUrl}}/orders?mine=1"));

    db.importCollection(payload());

    expect(db.getNode(target.id)!.definition?.url).toBe("{{baseUrl}}/orders?mine=1");
  });

  it("中途失败整体回滚，集合树 / 环境 / 变量与导入前完全一致", () => {
    const before = snapshot();

    // 第二个分组的 definition 含 BigInt，写到该行时 JSON.stringify 抛错
    const broken = payload("回滚用例");
    (broken.groups[1].requests[0].definition as unknown as Record<string, unknown>).bad = 1n;

    expect(() => db.importCollection(broken)).toThrow();
    expect(snapshot()).toBe(before);
  });
});

describe("POST /api/collections/import", () => {
  it("正常载荷返回创建结果", async () => {
    const res = await post(payload("端点服务"));
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.result.rootName).toBe("端点服务");
    expect(data.result.requests).toBe(3);
  });

  it("非法 JSON 被拒绝", async () => {
    const res = await POST(
      new Request("http://localhost/api/collections/import", { method: "POST", body: "{" })
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("合法 JSON");
  });

  it("结构非法时拒绝且不写入任何内容", async () => {
    const before = snapshot();
    const cases: Array<[unknown, string]> = [
      [{ groups: [], environments: [] }, "根文件夹名称"],
      [{ rootName: "A", groups: {}, environments: [] }, "groups 必须是数组"],
      [{ rootName: "A", groups: [{ name: "" }], environments: [] }, "分组名称"],
      [
        { rootName: "A", groups: [{ name: "g", requests: [{ name: "r", definition: { url: 1 } }] }], environments: [] },
        "定义结构非法",
      ],
      [{ rootName: "A", groups: [], environments: [{ name: "e" }] }, "缺少地址"],
    ];

    for (const [body, expected] of cases) {
      const res = await post(body);
      expect(res.status).toBe(400);
      expect((await res.json()).error).toContain(expected);
    }
    expect(snapshot()).toBe(before);
  });

  it("超出操作数量上限时拒绝", async () => {
    const requests = Array.from({ length: 2001 }, (_, i) => ({
      name: `r${i}`,
      definition: draft("{{baseUrl}}/x"),
    }));
    const res = await post({ rootName: "巨型服务", groups: [{ name: "g", requests }], environments: [] });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("上限");
  });
});
