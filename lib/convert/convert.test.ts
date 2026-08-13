import { describe, it, expect } from "vitest";
import { jsonToYaml, yamlToJson, formatJson, minifyJson } from "./jsonYaml";
import { encodeBase64, decodeBase64 } from "./base64";
import { encodeUrl, decodeUrl } from "./url";
import { timestampToDate, dateToTimestamp } from "./datetime";
import { generateUuids } from "./uuid";
import { decodeJwt } from "./jwt";
import { testRegex, MAX_TEXT_LENGTH } from "./regex";

describe("jsonYaml", () => {
  it("JSON → YAML → JSON 往返等价", () => {
    const src = '{"a":1,"b":["x","y"],"c":{"d":true}}';
    const yamlR = jsonToYaml(src);
    expect(yamlR.ok).toBe(true);
    const back = yamlToJson(yamlR.value!);
    expect(back.ok).toBe(true);
    expect(JSON.parse(back.value!)).toEqual(JSON.parse(src));
  });

  it("美化与压缩", () => {
    expect(formatJson('{"a":1}').value).toBe('{\n  "a": 1\n}');
    expect(minifyJson('{\n "a":  1\n}').value).toBe('{"a":1}');
  });

  it("非法 JSON 报错", () => {
    const r = jsonToYaml('{"a":');
    expect(r.ok).toBe(false);
    expect(r.error).toContain("JSON 解析失败");
  });

  it("非法 YAML 报错", () => {
    const r = yamlToJson("a: b: c: :");
    expect(r.ok).toBe(false);
    expect(r.error).toContain("YAML 解析失败");
  });

  it("空输入报错", () => {
    expect(jsonToYaml("   ").ok).toBe(false);
  });
});

describe("base64", () => {
  it("ASCII 往返", () => {
    const enc = encodeBase64("hello");
    expect(enc.value).toBe("aGVsbG8=");
    expect(decodeBase64(enc.value!).value).toBe("hello");
  });

  it("中文往返（UTF-8）", () => {
    const enc = encodeBase64("编码转换");
    expect(enc.ok).toBe(true);
    expect(decodeBase64(enc.value!).value).toBe("编码转换");
  });

  it("emoji 往返", () => {
    const enc = encodeBase64("🚀🛠");
    expect(decodeBase64(enc.value!).value).toBe("🚀🛠");
  });

  it("URL-safe 变体去填充并可解回", () => {
    const enc = encodeBase64("<<???>>", true);
    expect(enc.value).not.toContain("+");
    expect(enc.value).not.toContain("/");
    expect(enc.value).not.toContain("=");
    expect(decodeBase64(enc.value!).value).toBe("<<???>>");
  });

  it("非法 Base64 报错", () => {
    const r = decodeBase64("@@@");
    expect(r.ok).toBe(false);
  });

  it("空输入报错", () => {
    expect(decodeBase64("").ok).toBe(false);
  });
});

describe("url", () => {
  it("component 转义分隔符", () => {
    expect(encodeUrl("a=1&b=2", "component").value).toBe("a%3D1%26b%3D2");
  });

  it("full 保留结构分隔符", () => {
    expect(encodeUrl("https://x.com/a b?c=1", "full").value).toBe("https://x.com/a%20b?c=1");
  });

  it("解码往返", () => {
    expect(decodeUrl("a%3D1", "component").value).toBe("a=1");
  });

  it("非法转义序列报错", () => {
    const r = decodeUrl("%zz", "component");
    expect(r.ok).toBe(false);
    expect(r.error).toContain("非法转义");
  });
});

describe("datetime", () => {
  it("秒级时间戳转日期（UTC）", () => {
    const r = timestampToDate("0", "s");
    expect(r.ok).toBe(true);
    expect(r.value!.iso).toBe("1970-01-01T00:00:00.000Z");
  });

  it("毫秒级时间戳转日期", () => {
    const r = timestampToDate("1000", "ms");
    expect(r.value!.iso).toBe("1970-01-01T00:00:01.000Z");
  });

  it("日期转时间戳（秒/毫秒）", () => {
    const r = dateToTimestamp("1970-01-01T00:00:01.000Z");
    expect(r.value!.seconds).toBe(1);
    expect(r.value!.millis).toBe(1000);
  });

  it("非整数时间戳报错", () => {
    expect(timestampToDate("12.5", "s").ok).toBe(false);
  });

  it("非法日期报错", () => {
    expect(dateToTimestamp("not-a-date").ok).toBe(false);
  });
});

describe("uuid", () => {
  it("默认生成 1 个合法 v4", () => {
    const r = generateUuids();
    expect(r.value).toHaveLength(1);
    expect(r.value![0]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
  });

  it("批量生成且互不相同", () => {
    const r = generateUuids(50);
    expect(r.value).toHaveLength(50);
    expect(new Set(r.value).size).toBe(50);
  });

  it("非法数量报错", () => {
    expect(generateUuids(0).ok).toBe(false);
    expect(generateUuids(1001).ok).toBe(false);
  });
});

describe("jwt", () => {
  // header {"alg":"HS256","typ":"JWT"} . payload {"sub":"123","name":"张三"} . sig
  const token =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9." +
    "eyJzdWIiOiIxMjMiLCJuYW1lIjoi5byg5LiJIn0." +
    "abc123sig";

  it("解析合法 JWT 的 header/payload", () => {
    const r = decodeJwt(token);
    expect(r.ok).toBe(true);
    expect(JSON.parse(r.value!.header)).toEqual({ alg: "HS256", typ: "JWT" });
    expect(JSON.parse(r.value!.payload)).toEqual({ sub: "123", name: "张三" });
    expect(r.value!.signature).toBe("abc123sig");
  });

  it("段数不足报错", () => {
    const r = decodeJwt("a.b");
    expect(r.ok).toBe(false);
    expect(r.error).toContain("三段");
  });

  it("payload 非 JSON 报错", () => {
    const r = decodeJwt("eyJhbGciOiJIUzI1NiJ9.bm90anNvbg.sig");
    expect(r.ok).toBe(false);
  });

  it("空输入报错", () => {
    expect(decodeJwt("").ok).toBe(false);
  });
});

describe("regex", () => {
  it("全局匹配收集区间", () => {
    const r = testRegex("\\d+", "g", "a1b22c333");
    expect(r.ok).toBe(true);
    expect(r.value!.matches.map((m) => m.match)).toEqual(["1", "22", "333"]);
    expect(r.value!.matches[1]).toMatchObject({ start: 3, end: 5 });
  });

  it("无 g 只取首个", () => {
    const r = testRegex("\\d+", "", "a1b2");
    expect(r.value!.singleMatch).toBe(true);
    expect(r.value!.matches).toHaveLength(1);
    expect(r.value!.matches[0].match).toBe("1");
  });

  it("捕获分组", () => {
    const r = testRegex("(\\w)(\\d)", "g", "a1b2");
    expect(r.value!.matches[0].groups).toEqual(["a", "1"]);
  });

  it("非法 pattern 报错", () => {
    const r = testRegex("(", "", "x");
    expect(r.ok).toBe(false);
    expect(r.error).toContain("非法正则");
  });

  it("超长文本报错", () => {
    const r = testRegex("a", "g", "x".repeat(MAX_TEXT_LENGTH + 1));
    expect(r.ok).toBe(false);
  });
});
