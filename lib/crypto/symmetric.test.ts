import { describe, it, expect } from "vitest";
import { encrypt, decrypt } from "./symmetric";

/**
 * AES 对称加解密测试。
 *
 * ECB 用 FIPS-197 附录 C.1 的 AES-128 单块向量校验算法正确性
 * （Node 默认加 PKCS7 填充，故只断言首个分组）；
 * CBC/GCM 走往返一致性，并重点覆盖 GCM 认证标签被篡改的失败路径。
 */

const KEY128 = "000102030405060708090a0b0c0d0e0f";
const KEY256 = KEY128 + "101112131415161718191a1b1c1d1e1f";
const IV16 = "0f0e0d0c0b0a09080706050403020100";
const IV12 = "0f0e0d0c0b0a090807060504";

describe("ECB", () => {
  it("首个分组匹配 FIPS-197 AES-128 向量", () => {
    const r = encrypt({
      bits: 128,
      mode: "ecb",
      key: KEY128,
      keyEncoding: "hex",
      plaintext: "00112233445566778899aabbccddeeff",
      plaintextEncoding: "hex",
      outputEncoding: "hex",
    });
    expect(r.ok).toBe(true);
    expect(r.value!.ciphertext.slice(0, 32)).toBe("69c4e0d86a7b0430d8cdb78070b4c55a");
  });

  it("ECB 不需要 IV 也能往返", () => {
    const enc = encrypt({
      bits: 128,
      mode: "ecb",
      key: KEY128,
      keyEncoding: "hex",
      plaintext: "中文明文 abc",
      plaintextEncoding: "utf8",
      outputEncoding: "base64",
    });
    const dec = decrypt({
      bits: 128,
      mode: "ecb",
      key: KEY128,
      keyEncoding: "hex",
      ciphertext: enc.value!.ciphertext,
      ciphertextEncoding: "base64",
    });
    expect(dec.value).toBe("中文明文 abc");
  });

  it("ECB 不产出认证标签", () => {
    const r = encrypt({
      bits: 128,
      mode: "ecb",
      key: KEY128,
      keyEncoding: "hex",
      plaintext: "x",
      plaintextEncoding: "utf8",
      outputEncoding: "hex",
    });
    expect(r.value!.authTag).toBeUndefined();
  });
});

describe("CBC", () => {
  it("加解密往返一致", () => {
    const enc = encrypt({
      bits: 128,
      mode: "cbc",
      key: KEY128,
      keyEncoding: "hex",
      iv: IV16,
      ivEncoding: "hex",
      plaintext: "hello cbc 中文",
      plaintextEncoding: "utf8",
      outputEncoding: "hex",
    });
    const dec = decrypt({
      bits: 128,
      mode: "cbc",
      key: KEY128,
      keyEncoding: "hex",
      iv: IV16,
      ivEncoding: "hex",
      ciphertext: enc.value!.ciphertext,
      ciphertextEncoding: "hex",
    });
    expect(dec.value).toBe("hello cbc 中文");
  });

  it("缺少 IV 时报错", () => {
    const r = encrypt({
      bits: 128,
      mode: "cbc",
      key: KEY128,
      keyEncoding: "hex",
      plaintext: "x",
      plaintextEncoding: "utf8",
      outputEncoding: "hex",
    });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("IV");
  });

  it("IV 长度不足时报错并给出期望与实际值", () => {
    const r = encrypt({
      bits: 128,
      mode: "cbc",
      key: KEY128,
      keyEncoding: "hex",
      iv: "0f0e",
      ivEncoding: "hex",
      plaintext: "x",
      plaintextEncoding: "utf8",
      outputEncoding: "hex",
    });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("16 字节");
    expect(r.error).toContain("2 字节");
  });

  it("错误密钥解密给出可读的 padding 提示", () => {
    const enc = encrypt({
      bits: 128,
      mode: "cbc",
      key: KEY128,
      keyEncoding: "hex",
      iv: IV16,
      ivEncoding: "hex",
      plaintext: "some longer plaintext to fill blocks",
      plaintextEncoding: "utf8",
      outputEncoding: "hex",
    });
    const dec = decrypt({
      bits: 128,
      mode: "cbc",
      key: "ffffffffffffffffffffffffffffffff",
      keyEncoding: "hex",
      iv: IV16,
      ivEncoding: "hex",
      ciphertext: enc.value!.ciphertext,
      ciphertextEncoding: "hex",
    });
    expect(dec.ok).toBe(false);
    expect(dec.error).not.toContain("error:");
    expect(dec.error).toMatch(/解密失败|不是合法的 UTF-8/);
  });
});

describe("GCM", () => {
  const encGcm = () =>
    encrypt({
      bits: 256,
      mode: "gcm",
      key: KEY256,
      keyEncoding: "hex",
      iv: IV12,
      ivEncoding: "hex",
      plaintext: "gcm 明文",
      plaintextEncoding: "utf8",
      outputEncoding: "hex",
    });

  it("加密产出独立的密文与认证标签", () => {
    const r = encGcm();
    expect(r.ok).toBe(true);
    expect(r.value!.ciphertext).toBeTruthy();
    // 标签固定 16 字节 = 32 个 hex 字符，且不被拼进密文
    expect(r.value!.authTag).toHaveLength(32);
    expect(r.value!.ciphertext).not.toContain(r.value!.authTag!);
  });

  it("提供正确标签可解出原文", () => {
    const enc = encGcm();
    const dec = decrypt({
      bits: 256,
      mode: "gcm",
      key: KEY256,
      keyEncoding: "hex",
      iv: IV12,
      ivEncoding: "hex",
      ciphertext: enc.value!.ciphertext,
      ciphertextEncoding: "hex",
      authTag: enc.value!.authTag,
      authTagEncoding: "hex",
    });
    expect(dec.value).toBe("gcm 明文");
  });

  it("标签被篡改则解密失败且不泄露任何明文", () => {
    const enc = encGcm();
    const tampered = enc.value!.authTag!.replace(/^./, (c) => (c === "0" ? "1" : "0"));
    const dec = decrypt({
      bits: 256,
      mode: "gcm",
      key: KEY256,
      keyEncoding: "hex",
      iv: IV12,
      ivEncoding: "hex",
      ciphertext: enc.value!.ciphertext,
      ciphertextEncoding: "hex",
      authTag: tampered,
      authTagEncoding: "hex",
    });
    expect(dec.ok).toBe(false);
    expect(dec.value).toBeUndefined();
    expect(dec.error).toContain("认证标签");
  });

  it("解密缺少认证标签时前置报错", () => {
    const enc = encGcm();
    const dec = decrypt({
      bits: 256,
      mode: "gcm",
      key: KEY256,
      keyEncoding: "hex",
      iv: IV12,
      ivEncoding: "hex",
      ciphertext: enc.value!.ciphertext,
      ciphertextEncoding: "hex",
    });
    expect(dec.ok).toBe(false);
    expect(dec.error).toContain("认证标签");
  });

  it("IV 非 12 字节时报错", () => {
    const r = encrypt({
      bits: 256,
      mode: "gcm",
      key: KEY256,
      keyEncoding: "hex",
      iv: IV16,
      ivEncoding: "hex",
      plaintext: "x",
      plaintextEncoding: "utf8",
      outputEncoding: "hex",
    });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("12 字节");
  });
});

describe("密钥长度校验", () => {
  it("AES-256 给 16 字节密钥时报错并含两个数值", () => {
    const r = encrypt({
      bits: 256,
      mode: "cbc",
      key: KEY128,
      keyEncoding: "hex",
      iv: IV16,
      ivEncoding: "hex",
      plaintext: "x",
      plaintextEncoding: "utf8",
      outputEncoding: "hex",
    });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("32 字节");
    expect(r.error).toContain("16 字节");
  });

  it("AES-192 正常工作", () => {
    const key192 = KEY128 + "1011121314151617";
    const enc = encrypt({
      bits: 192,
      mode: "cbc",
      key: key192,
      keyEncoding: "hex",
      iv: IV16,
      ivEncoding: "hex",
      plaintext: "aes192",
      plaintextEncoding: "utf8",
      outputEncoding: "hex",
    });
    const dec = decrypt({
      bits: 192,
      mode: "cbc",
      key: key192,
      keyEncoding: "hex",
      iv: IV16,
      ivEncoding: "hex",
      ciphertext: enc.value!.ciphertext,
      ciphertextEncoding: "hex",
    });
    expect(dec.value).toBe("aes192");
  });

  it("密钥为空时报错", () => {
    const r = encrypt({
      bits: 128,
      mode: "ecb",
      key: "",
      keyEncoding: "hex",
      plaintext: "x",
      plaintextEncoding: "utf8",
      outputEncoding: "hex",
    });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("密钥不能为空");
  });
});
