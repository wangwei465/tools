import { describe, it, expect } from "vitest";
import { hash, hashHex } from "./hash";
import { decodeInput, encodeOutput } from "./types";

/**
 * 摘要与编码工具测试。
 *
 * 期望值取自公开标准向量：MD5 见 RFC 1321 附录 A.5，
 * SHA 系列见 FIPS 180 的 "abc" 示例。
 */

describe("decodeInput", () => {
  it("utf8 原样解析", () => {
    expect(decodeInput("abc", "utf8").value!.toString("hex")).toBe("616263");
  });

  it("hex 忽略空白", () => {
    expect(decodeInput("61 62\n63", "hex").value!.toString("utf8")).toBe("abc");
  });

  it("hex 含非十六进制字符报错并带字段名", () => {
    const r = decodeInput("6g", "hex", "密钥");
    expect(r.ok).toBe(false);
    expect(r.error).toContain("密钥");
    expect(r.error).toContain("非十六进制");
  });

  it("hex 长度为奇数报错且带实际长度", () => {
    const r = decodeInput("616", "hex");
    expect(r.ok).toBe(false);
    expect(r.error).toContain("3 个字符");
  });

  it("base64 非法字符报错（不静默忽略）", () => {
    const r = decodeInput("YWJj*&^", "base64");
    expect(r.ok).toBe(false);
    expect(r.error).toContain("无效字符");
  });

  it("base64 正常解析并兼容 URL-safe 变体", () => {
    expect(decodeInput("YWJj", "base64").value!.toString("utf8")).toBe("abc");
    expect(decodeInput("_-8=", "base64").ok).toBe(true);
  });

  it("base64 长度不合法报错", () => {
    const r = decodeInput("YWJjZ", "base64");
    expect(r.ok).toBe(false);
    expect(r.error).toContain("长度不合法");
  });
});

describe("encodeOutput", () => {
  it("hex 与 base64 两种呈现", () => {
    const buf = Buffer.from("abc", "utf8");
    expect(encodeOutput(buf, "hex")).toBe("616263");
    expect(encodeOutput(buf, "base64")).toBe("YWJj");
  });
});

describe("hash", () => {
  const of = (algorithm: any, input = "abc") =>
    hash({ algorithm, input, inputEncoding: "utf8", outputEncoding: "hex" }).value;

  it("MD5 匹配 RFC 1321 向量", () => {
    expect(of("md5", "")).toBe("d41d8cd98f00b204e9800998ecf8427e");
    expect(of("md5")).toBe("900150983cd24fb0d6963f7d28e17f72");
  });

  it("SHA1 匹配 FIPS 180 向量", () => {
    expect(of("sha1")).toBe("a9993e364706816aba3e25717850c26c9cd0d89d");
  });

  it("SHA256 匹配 FIPS 180 向量", () => {
    expect(of("sha256")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    );
  });

  it("SHA512 匹配 FIPS 180 向量", () => {
    expect(of("sha512")).toBe(
      "ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a" +
        "2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f"
    );
  });

  it("base64 输出编码", () => {
    const r = hash({
      algorithm: "sha256",
      input: "abc",
      inputEncoding: "utf8",
      outputEncoding: "base64",
    });
    expect(r.value).toBe("ungWv48Bz+pBQUDeXa4iI7ADYaOWF3qctBD/YfIAFa0=");
  });

  it("hex 输入编码与 utf8 等价", () => {
    const viaHex = hash({
      algorithm: "sha256",
      input: "616263",
      inputEncoding: "hex",
      outputEncoding: "hex",
    });
    expect(viaHex.value).toBe(of("sha256"));
  });

  it("输入编码非法时报错且不产出结果", () => {
    const r = hash({
      algorithm: "sha256",
      input: "zz",
      inputEncoding: "hex",
      outputEncoding: "hex",
    });
    expect(r.ok).toBe(false);
    expect(r.value).toBeUndefined();
  });

  it("不受支持的算法报错", () => {
    const r = hash({
      algorithm: "sha3" as any,
      input: "abc",
      inputEncoding: "utf8",
      outputEncoding: "hex",
    });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("不受支持");
  });
});

describe("hashHex", () => {
  it("输出小写十六进制，供 /api/signature 复用", () => {
    const r = hashHex("md5", "1700000000000app-123secret-xyz");
    expect(r.value).toBe("d2df68db5ad8afd25adda61f9ae63afb");
    expect(r.value).toMatch(/^[0-9a-f]{32}$/);
  });
});
