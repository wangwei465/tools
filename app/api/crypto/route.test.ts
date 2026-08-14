import { describe, it, expect } from "vitest";
import { POST } from "./route";

/**
 * /api/crypto 端点契约测试。
 *
 * 覆盖 crypto-compute-api 规格中的入口错误、统一响应形状与分发正确性；
 * 各算法自身的正确性已由 lib/crypto 的纯函数测试用标准向量覆盖，此处不重复。
 */

async function post(body: unknown) {
  const res = await POST(
    new Request("http://localhost/api/crypto", {
      method: "POST",
      body: typeof body === "string" ? body : JSON.stringify(body),
    })
  );
  return { status: res.status, json: await res.json() };
}

describe("入口错误", () => {
  it("请求体非法 JSON 返回 400", async () => {
    const { status, json } = await post("not-json");
    expect(status).toBe(400);
    expect(json).toEqual({ ok: false, error: "请求体不是合法 JSON" });
  });

  it("缺少 op 返回 400 且提示未提供", async () => {
    const { status, json } = await post({ input: "abc" });
    expect(status).toBe(400);
    expect(json.ok).toBe(false);
    expect(json.error).toContain("未提供");
  });

  it("不受支持的 op 返回 400", async () => {
    const { status, json } = await post({ op: "mine-bitcoin" });
    expect(status).toBe(400);
    expect(json.error).toContain("不受支持的操作类型");
  });
});

describe("统一响应形状", () => {
  it("成功返回 { ok: true, value }", async () => {
    const { status, json } = await post({
      op: "hash",
      algorithm: "sha256",
      input: "abc",
      inputEncoding: "utf8",
      outputEncoding: "hex",
    });
    expect(status).toBe(200);
    expect(json).toEqual({
      ok: true,
      value: "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    });
  });

  it("失败返回 { ok: false, error } 且不含结果字段", async () => {
    const { status, json } = await post({
      op: "hmac",
      algorithm: "sha256",
      input: "abc",
      inputEncoding: "utf8",
      key: "",
      keyEncoding: "utf8",
      outputEncoding: "hex",
    });
    expect(status).toBe(400);
    expect(json.ok).toBe(false);
    expect(json.error).toContain("密钥不能为空");
    expect(json).not.toHaveProperty("value");
  });

  it("参数校验失败的错误信息含期望与实际数值", async () => {
    const { json } = await post({
      op: "encrypt",
      bits: 256,
      mode: "cbc",
      key: "000102030405060708090a0b0c0d0e0f",
      keyEncoding: "hex",
      iv: "0f0e0d0c0b0a09080706050403020100",
      ivEncoding: "hex",
      plaintext: "x",
      plaintextEncoding: "utf8",
      outputEncoding: "hex",
    });
    expect(json.error).toContain("32 字节");
    expect(json.error).toContain("16 字节");
  });
});

describe("按 op 分发", () => {
  it("hmac 走 HMAC 实现", async () => {
    const { json } = await post({
      op: "hmac",
      algorithm: "sha1",
      input: "what do ya want for nothing?",
      inputEncoding: "utf8",
      key: "Jefe",
      keyEncoding: "utf8",
      outputEncoding: "hex",
    });
    expect(json.value).toBe("effcdf6ae5eb2fa2d27416d5f184df9c259a7c79");
  });

  it("encrypt/decrypt 默认走 AES，往返一致", async () => {
    const common = {
      bits: 128,
      mode: "gcm",
      key: "000102030405060708090a0b0c0d0e0f",
      keyEncoding: "hex",
      iv: "0f0e0d0c0b0a090807060504",
      ivEncoding: "hex",
    };
    const enc = await post({
      op: "encrypt",
      ...common,
      plaintext: "round trip",
      plaintextEncoding: "utf8",
      outputEncoding: "hex",
    });
    expect(enc.json.value.authTag).toHaveLength(32);

    const dec = await post({
      op: "decrypt",
      ...common,
      ciphertext: enc.json.value.ciphertext,
      ciphertextEncoding: "hex",
      authTag: enc.json.value.authTag,
      authTagEncoding: "hex",
    });
    expect(dec.json.value).toBe("round trip");
  });

  it("scheme 为 rsa 时 encrypt 走 RSA 分支", async () => {
    const { json } = await post({
      op: "encrypt",
      scheme: "rsa",
      publicKeyPem: "invalid pem",
      plaintext: "x",
      padding: "oaep",
      outputEncoding: "base64",
    });
    // 走到 RSA 分支的证据：报的是 PEM 解析失败而非 AES 的密钥长度错误
    expect(json.error).toContain("PEM");
  });

  it("kdf 走密钥派生实现（RFC 6070 向量）", async () => {
    const { json } = await post({
      op: "kdf",
      algorithm: "pbkdf2",
      password: "password",
      salt: "salt",
      saltEncoding: "utf8",
      iterations: 4096,
      keyLength: 20,
      digest: "sha1",
      outputEncoding: "hex",
    });
    expect(json.value).toBe("4b007901b765489abead49d926f721d065a429c1");
  });

  it("verify 未通过时仍是成功响应，value 为 false", async () => {
    const { status, json } = await post({
      op: "verify",
      publicKeyPem:
        "-----BEGIN PUBLIC KEY-----\nMFwwDQYJKoZIhvcNAQEBBQADSwAwSAJBAKj34GkxFhD90vcNLYLInFEX6Ppy1tPf\n9Cnzj4p4WGeKLs1Pt8QuKUpRKfFLfRYC9AIKjbJTWit+CqvjWYzvQwECAwEAAQ==\n-----END PUBLIC KEY-----",
      message: "m",
      signature: "AAAA",
      signatureEncoding: "base64",
      algorithm: "sha256",
      padding: "pkcs1",
    });
    expect(status).toBe(200);
    expect(json).toEqual({ ok: true, value: false });
  });
});
