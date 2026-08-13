import { describe, it, expect } from "vitest";
import { parseCurl, tokenizeCurl, CurlParseError } from "./curl";
import { CODE_TARGETS } from "./codegen";
import { assembleRequest } from "./assemble";
import type { WireEnvelope } from "./types";

const gen = (id: string, wire: WireEnvelope) =>
  CODE_TARGETS.find((t) => t.id === id)!.generate(wire);

/* ─── tokenizer ─────────────────────────────────────────── */

describe("tokenizeCurl", () => {
  it("处理引号、`\\` 续行与空白", () => {
    const cmd = `curl -X POST 'https://a.com' \\\n  -H "K: v v" -d '{"a":1}'`;
    expect(tokenizeCurl(cmd)).toEqual([
      "curl",
      "-X",
      "POST",
      "https://a.com",
      "-H",
      "K: v v",
      "-d",
      '{"a":1}',
    ]);
  });
});

/* ─── 6.2 导入冒烟 ──────────────────────────────────────── */

describe("parseCurl 导入", () => {
  it("GET：仅 URL", () => {
    const { draft } = parseCurl("curl https://api.example.com/users");
    expect(draft.method).toBe("GET");
    expect(draft.url).toBe("https://api.example.com/users");
  });

  it("POST -H + -d(json)：raw(JSON) + header", () => {
    const { draft } = parseCurl(
      `curl -X POST 'https://api.example.com/u' -H 'Content-Type: application/json' -d '{"a":1}'`
    );
    expect(draft.method).toBe("POST");
    expect(draft.headers).toContainEqual({
      key: "Content-Type",
      value: "application/json",
      enabled: true,
    });
    expect(draft.body.type).toBe("raw");
    expect(draft.body.raw).toBe('{"a":1}');
  });

  it("无 -X 但有 -d：默认 POST；无 content-type 且 JSON 形 → raw", () => {
    const { draft } = parseCurl(`curl https://a.com -d '{"x":true}'`);
    expect(draft.method).toBe("POST");
    expect(draft.body.type).toBe("raw");
  });

  it("--data-urlencode 'a=1&b=2' → urlencoded 键值", () => {
    const { draft } = parseCurl(`curl https://a.com --data-urlencode 'a=1&b=2'`);
    expect(draft.body.type).toBe("urlencoded");
    expect(draft.body.urlencoded).toEqual([
      { key: "a", value: "1", enabled: true },
      { key: "b", value: "2", enabled: true },
    ]);
  });

  it("-F 含文件占位 → form-data，文件保留路径", () => {
    const { draft } = parseCurl(`curl https://a.com -F 'name=foo' -F 'file=@/path/x.png'`);
    expect(draft.body.type).toBe("form-data");
    expect(draft.body.formData[0]).toEqual({
      key: "name",
      kind: "text",
      value: "foo",
      enabled: true,
    });
    expect(draft.body.formData[1]).toMatchObject({
      key: "file",
      kind: "file",
      fileName: "/path/x.png",
    });
  });

  it("-u user:pass → basic auth", () => {
    const { draft } = parseCurl(`curl https://a.com -u alice:secret`);
    expect(draft.auth.type).toBe("basic");
    expect(draft.auth.basicUser).toBe("alice");
    expect(draft.auth.basicPassword).toBe("secret");
  });

  it("URL query → params 拆分", () => {
    const { draft } = parseCurl(`curl 'https://a.com/s?q=hi&n=2'`);
    expect(draft.params).toEqual([
      { key: "q", value: "hi", enabled: true },
      { key: "n", value: "2", enabled: true },
    ]);
  });

  it("未识别选项被忽略并上报", () => {
    const { draft, unknownOptions } = parseCurl(`curl --frobnicate https://a.com`);
    expect(draft.url).toBe("https://a.com");
    expect(unknownOptions).toContain("--frobnicate");
  });

  it("畸形 / 空 curl 抛 CurlParseError", () => {
    expect(() => parseCurl("")).toThrow(CurlParseError);
    expect(() => parseCurl("curl")).toThrow(CurlParseError); // 无 URL
  });
});

/* ─── 6.3 生成冒烟：与实际发送等价 ──────────────────────── */

describe("代码生成与实际发送等价", () => {
  it("curl 生成含方法 / header / body", () => {
    const { draft } = parseCurl(
      `curl -X POST 'https://api.example.com/u' -H 'Content-Type: application/json' -d '{"a":1}'`
    );
    const wire = assembleRequest(draft);
    const out = gen("curl", wire);
    expect(out).toContain("curl -X POST 'https://api.example.com/u'");
    expect(out).toContain("-H 'Content-Type: application/json'");
    expect(out).toContain(`-d '{"a":1}'`);
  });

  it("fetch 生成含 method / headers / body", () => {
    const { draft } = parseCurl(
      `curl -X POST 'https://a.com' -H 'X-K: v' -d '{"a":1}'`
    );
    const wire = assembleRequest(draft);
    const out = gen("fetch", wire);
    expect(out).toContain('fetch("https://a.com"');
    expect(out).toContain('method: "POST"');
    expect(out).toContain('"X-K": "v"');
    expect(out).toContain('body: "{\\"a\\":1}"');
  });

  it("所见即所发：Auth 已注入、params 已并入 URL", () => {
    // params 存在于 URL（真相源），basic auth 注入 header
    const { draft } = parseCurl(`curl 'https://a.com/s?q=1' -u u:p`);
    const wire = assembleRequest(draft);
    expect(wire.url).toContain("q=1");
    expect(wire.headers["Authorization"]).toMatch(/^Basic /);
    const out = gen("curl", wire);
    expect(out).toContain("q=1");
    expect(out).toContain("-H 'Authorization: Basic");
  });

  it("变量替换后值参与生成（③ 在场）", () => {
    const { draft } = parseCurl(`curl 'https://{{host}}/api' -H 'Authorization: Bearer {{tok}}'`);
    const vars = new Map([
      ["host", "prod.example.com"],
      ["tok", "T123"],
    ]);
    const wire = assembleRequest(draft, vars);
    const out = gen("curl", wire);
    expect(out).toContain("https://prod.example.com/api");
    expect(out).toContain("Bearer T123");
  });
});
