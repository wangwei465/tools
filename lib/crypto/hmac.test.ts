import { describe, it, expect } from "vitest";
import { hmac } from "./hmac";

/**
 * HMAC 测试。
 *
 * 期望值取自 RFC 2202（HMAC-MD5 / HMAC-SHA1）与 RFC 4231（HMAC-SHA256）
 * 的第 1、2 号测试用例。密钥以 hex 编码传入，正好同时验证密钥编码路径。
 */

/** RFC 2202/4231 用例 1 的密钥：0x0b 重复 n 次 */
const keyOf = (n: number) => Buffer.alloc(n, 0x0b).toString("hex");

describe("hmac", () => {
  it("HMAC-MD5 匹配 RFC 2202 用例 1", () => {
    const r = hmac({
      algorithm: "md5",
      input: "Hi There",
      inputEncoding: "utf8",
      key: keyOf(16),
      keyEncoding: "hex",
      outputEncoding: "hex",
    });
    expect(r.value).toBe("9294727a3638bb1c13f48ef8158bfc9d");
  });

  it("HMAC-SHA1 匹配 RFC 2202 用例 1", () => {
    const r = hmac({
      algorithm: "sha1",
      input: "Hi There",
      inputEncoding: "utf8",
      key: keyOf(20),
      keyEncoding: "hex",
      outputEncoding: "hex",
    });
    expect(r.value).toBe("b617318655057264e28bc0b6fb378c8ef146be00");
  });

  it("HMAC-SHA1 匹配 RFC 2202 用例 2（ASCII 密钥）", () => {
    const r = hmac({
      algorithm: "sha1",
      input: "what do ya want for nothing?",
      inputEncoding: "utf8",
      key: "Jefe",
      keyEncoding: "utf8",
      outputEncoding: "hex",
    });
    expect(r.value).toBe("effcdf6ae5eb2fa2d27416d5f184df9c259a7c79");
  });

  it("HMAC-SHA256 匹配 RFC 4231 用例 1", () => {
    const r = hmac({
      algorithm: "sha256",
      input: "Hi There",
      inputEncoding: "utf8",
      key: keyOf(20),
      keyEncoding: "hex",
      outputEncoding: "hex",
    });
    expect(r.value).toBe(
      "b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7"
    );
  });

  it("SHA512 可用且输出长度正确", () => {
    const r = hmac({
      algorithm: "sha512",
      input: "Hi There",
      inputEncoding: "utf8",
      key: keyOf(20),
      keyEncoding: "hex",
      outputEncoding: "hex",
    });
    expect(r.ok).toBe(true);
    expect(r.value).toHaveLength(128);
  });

  it("密钥为空时前置报错", () => {
    const r = hmac({
      algorithm: "sha256",
      input: "x",
      inputEncoding: "utf8",
      key: "",
      keyEncoding: "utf8",
      outputEncoding: "hex",
    });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("密钥不能为空");
  });

  it("密钥编码非法时错误信息指向密钥字段", () => {
    const r = hmac({
      algorithm: "sha256",
      input: "x",
      inputEncoding: "utf8",
      key: "zz",
      keyEncoding: "hex",
      outputEncoding: "hex",
    });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("密钥");
  });

  it("base64 输出编码与 hex 表示同一个值", () => {
    const params = {
      algorithm: "sha256" as const,
      input: "Hi There",
      inputEncoding: "utf8" as const,
      key: keyOf(20),
      keyEncoding: "hex" as const,
    };
    const hex = hmac({ ...params, outputEncoding: "hex" }).value!;
    const b64 = hmac({ ...params, outputEncoding: "base64" }).value!;
    expect(Buffer.from(b64, "base64").toString("hex")).toBe(hex);
  });
});
