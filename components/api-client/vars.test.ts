import { describe, it, expect } from "vitest";
import { resolveVars, substituteString, substituteDraft } from "./vars";
import { emptyRequest } from "./types";
import type { ApiVariable } from "./types";

const v = (
  id: number,
  envId: number | null,
  key: string,
  value: string,
  enabled = true
): ApiVariable => ({ id, envId, key, value, enabled });

describe("resolveVars", () => {
  it("环境覆盖全局，仅 enabled 生效", () => {
    const vars = [
      v(1, null, "host", "global.com"),
      v(2, 10, "host", "env.com"),
      v(3, null, "token", "GT"),
      v(4, 10, "disabled", "x", false),
    ];
    const m = resolveVars(vars, 10);
    expect(m.get("host")).toBe("env.com"); // 激活环境覆盖全局
    expect(m.get("token")).toBe("GT"); // 全局保留
    expect(m.has("disabled")).toBe(false); // 禁用不参与
  });

  it("无环境时仅全局生效", () => {
    const vars = [v(1, null, "host", "g"), v(2, 10, "host", "e")];
    expect(resolveVars(vars, null).get("host")).toBe("g");
  });

  it("空 key 变量被忽略", () => {
    expect(resolveVars([v(1, null, "", "x")], null).size).toBe(0);
  });
});

describe("substituteString", () => {
  it("替换已定义、保留未定义并记录 missing", () => {
    const missing = new Set<string>();
    const out = substituteString("{{host}}/a/{{unknown}}", new Map([["host", "x.com"]]), missing);
    expect(out).toBe("x.com/a/{{unknown}}");
    expect([...missing]).toEqual(["unknown"]);
  });

  it("单趟替换：值内的 {{}} 不二次解析", () => {
    const vars = new Map([
      ["a", "{{b}}"],
      ["b", "BBB"],
    ]);
    expect(substituteString("{{a}}", vars)).toBe("{{b}}"); // a→{{b}}，不再展开
  });

  it("容忍 {{ key }} 两侧空格", () => {
    expect(substituteString("{{ k }}", new Map([["k", "V"]]))).toBe("V");
  });
});

describe("substituteDraft", () => {
  it("替换 url/headers/body/auth 并收集 missing", () => {
    const d = emptyRequest();
    d.url = "{{host}}/users";
    d.headers = [{ key: "Authorization", value: "Bearer {{token}}", enabled: true }];
    d.body = { type: "raw", raw: '{"id":"{{uid}}"}', formData: [], urlencoded: [] };
    d.auth = { ...d.auth, type: "bearer", bearerToken: "{{token}}" };

    const { draft, missing } = substituteDraft(
      d,
      new Map([
        ["host", "h.com"],
        ["token", "T"],
      ])
    );
    expect(draft.url).toBe("h.com/users");
    expect(draft.headers[0].value).toBe("Bearer T");
    expect(draft.auth.bearerToken).toBe("T");
    expect(draft.body.raw).toBe('{"id":"{{uid}}"}'); // uid 未定义原样保留
    expect(missing).toContain("uid");
  });

  it("无变量时输出等同原 draft（幂等直通，回归 ①/②）", () => {
    const d = emptyRequest();
    d.url = "http://x.com/a";
    expect(substituteDraft(d, new Map()).draft.url).toBe("http://x.com/a");
  });
});
