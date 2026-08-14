import { describe, it, expect, beforeAll } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import { rsaEncrypt, rsaDecrypt, rsaSign, rsaVerify } from "./asymmetric";

/**
 * RSA 测试。
 *
 * 密钥对在测试内即时生成而非硬编码进仓库：避免把私钥文本提交到版本库，
 * 也顺带证明实现能吃标准 PEM 输出。2048 位生成一次约数百毫秒，可接受。
 */

let publicKeyPem = "";
let privateKeyPem = "";
let otherPublicPem = "";

beforeAll(() => {
  const pair = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  publicKeyPem = pair.publicKey;
  privateKeyPem = pair.privateKey;
  otherPublicPem = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  }).publicKey;
});

describe("RSA 加解密", () => {
  it("OAEP 往返一致", () => {
    const enc = rsaEncrypt({
      publicKeyPem,
      plaintext: "rsa 明文 abc",
      padding: "oaep",
      oaepHash: "sha256",
      outputEncoding: "base64",
    });
    expect(enc.ok).toBe(true);
    const dec = rsaDecrypt({
      privateKeyPem,
      ciphertext: enc.value!,
      ciphertextEncoding: "base64",
      padding: "oaep",
      oaepHash: "sha256",
    });
    expect(dec.value).toBe("rsa 明文 abc");
  });

  it("PKCS#1 v1.5 往返一致（遗留系统对接）", () => {
    const enc = rsaEncrypt({
      publicKeyPem,
      plaintext: "legacy",
      padding: "pkcs1",
      outputEncoding: "hex",
    });
    const dec = rsaDecrypt({
      privateKeyPem,
      ciphertext: enc.value!,
      ciphertextEncoding: "hex",
      padding: "pkcs1",
    });
    expect(dec.value).toBe("legacy");
  });

  it("私钥 PEM 可当作公钥来源用于加密", () => {
    const enc = rsaEncrypt({
      publicKeyPem: privateKeyPem,
      plaintext: "x",
      padding: "oaep",
      outputEncoding: "base64",
    });
    expect(enc.ok).toBe(true);
  });

  it("明文超出密钥可承载长度时给可读提示", () => {
    const enc = rsaEncrypt({
      publicKeyPem,
      plaintext: "x".repeat(500),
      padding: "oaep",
      outputEncoding: "base64",
    });
    expect(enc.ok).toBe(false);
    expect(enc.error).not.toContain("error:");
  });

  it("非法 PEM 给出可读提示而非底层错误", () => {
    const enc = rsaEncrypt({
      publicKeyPem: "not a pem at all",
      plaintext: "x",
      padding: "oaep",
      outputEncoding: "base64",
    });
    expect(enc.ok).toBe(false);
    expect(enc.error).toContain("PEM");
  });

  it("空 PEM 给出可读提示", () => {
    const enc = rsaEncrypt({
      publicKeyPem: "   ",
      plaintext: "x",
      padding: "oaep",
      outputEncoding: "base64",
    });
    expect(enc.ok).toBe(false);
    expect(enc.error).toContain("PEM");
  });
});

describe("RSA 签名验签", () => {
  const signWith = (padding: "pss" | "pkcs1") =>
    rsaSign({
      privateKeyPem,
      message: "message to sign",
      algorithm: "sha256",
      padding,
      outputEncoding: "base64",
    });

  it("PSS 签名可被公钥验签通过", () => {
    const sig = signWith("pss");
    expect(sig.ok).toBe(true);
    const v = rsaVerify({
      publicKeyPem,
      message: "message to sign",
      signature: sig.value!,
      signatureEncoding: "base64",
      algorithm: "sha256",
      padding: "pss",
    });
    expect(v.value).toBe(true);
  });

  it("PKCS#1 v1.5 签名可被验签通过", () => {
    const sig = signWith("pkcs1");
    const v = rsaVerify({
      publicKeyPem,
      message: "message to sign",
      signature: sig.value!,
      signatureEncoding: "base64",
      algorithm: "sha256",
      padding: "pkcs1",
    });
    expect(v.value).toBe(true);
  });

  it("消息被改动则验签未通过，且不作为异常", () => {
    const sig = signWith("pss");
    const v = rsaVerify({
      publicKeyPem,
      message: "message to sign!",
      signature: sig.value!,
      signatureEncoding: "base64",
      algorithm: "sha256",
      padding: "pss",
    });
    // 关键语义：ok 为 true（调用成功），结果为 false（未通过）
    expect(v.ok).toBe(true);
    expect(v.value).toBe(false);
    expect(v.error).toBeUndefined();
  });

  it("用无关公钥验签未通过", () => {
    const sig = signWith("pss");
    const v = rsaVerify({
      publicKeyPem: otherPublicPem,
      message: "message to sign",
      signature: sig.value!,
      signatureEncoding: "base64",
      algorithm: "sha256",
      padding: "pss",
    });
    expect(v.ok).toBe(true);
    expect(v.value).toBe(false);
  });

  it("签名编码非法时报错并指向签名字段", () => {
    const v = rsaVerify({
      publicKeyPem,
      message: "m",
      signature: "!!!",
      signatureEncoding: "base64",
      algorithm: "sha256",
      padding: "pss",
    });
    expect(v.ok).toBe(false);
    expect(v.error).toContain("签名");
  });

  it("不受支持的摘要算法报错", () => {
    const sig = rsaSign({
      privateKeyPem,
      message: "m",
      algorithm: "sha3" as any,
      padding: "pss",
      outputEncoding: "base64",
    });
    expect(sig.ok).toBe(false);
    expect(sig.error).toContain("不受支持");
  });
});
