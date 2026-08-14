import { describe, it, expect } from "vitest";
import { derive } from "./kdf";

/**
 * 密钥派生测试。
 *
 * PBKDF2 期望值取自 RFC 6070 的测试向量（HMAC-SHA1，dkLen=20）。
 * scrypt 无同等简明的公开向量，故走确定性与参数校验路径。
 */

const base = {
  password: "password",
  salt: "salt",
  saltEncoding: "utf8" as const,
  keyLength: 20,
  outputEncoding: "hex" as const,
};

describe("PBKDF2", () => {
  const pbkdf2 = (iterations: number) =>
    derive({ ...base, algorithm: "pbkdf2", iterations, digest: "sha1" }).value;

  it("c=1 匹配 RFC 6070", () => {
    expect(pbkdf2(1)).toBe("0c60c80f961f0e71f3a9b524af6012062fe037a6");
  });

  it("c=2 匹配 RFC 6070", () => {
    expect(pbkdf2(2)).toBe("ea6c014dc72d6f8ccd1ed92ace1d41f0d8de8957");
  });

  it("c=4096 匹配 RFC 6070", () => {
    expect(pbkdf2(4096)).toBe("4b007901b765489abead49d926f721d065a429c1");
  });

  it("默认摘要为 sha256（未指定 digest 时）", () => {
    const withDefault = derive({ ...base, algorithm: "pbkdf2", iterations: 1000 });
    const explicit = derive({
      ...base,
      algorithm: "pbkdf2",
      iterations: 1000,
      digest: "sha256",
    });
    expect(withDefault.value).toBe(explicit.value);
  });

  it("输出长度决定结果字节数", () => {
    const r = derive({ ...base, algorithm: "pbkdf2", iterations: 10, keyLength: 32 });
    expect(r.value).toHaveLength(64);
  });

  it("迭代次数非正整数时报错并带实际值", () => {
    const r = derive({ ...base, algorithm: "pbkdf2", iterations: 0 });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("迭代次数");
    expect(r.error).toContain("0");
  });

  it("迭代次数为小数时报错", () => {
    const r = derive({ ...base, algorithm: "pbkdf2", iterations: 1.5 });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("正整数");
  });

  it("输出长度非法时报错", () => {
    const r = derive({ ...base, algorithm: "pbkdf2", iterations: 10, keyLength: -1 });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("输出长度");
  });
});

describe("scrypt", () => {
  it("相同参数产出确定结果", () => {
    const a = derive({ ...base, algorithm: "scrypt", cost: 1024 });
    const b = derive({ ...base, algorithm: "scrypt", cost: 1024 });
    expect(a.ok).toBe(true);
    expect(a.value).toBe(b.value);
    expect(a.value).toHaveLength(40);
  });

  it("不同盐值产出不同结果", () => {
    const a = derive({ ...base, algorithm: "scrypt", cost: 1024 });
    const b = derive({ ...base, salt: "pepper", algorithm: "scrypt", cost: 1024 });
    expect(a.value).not.toBe(b.value);
  });

  it("cost 非 2 的幂时给出可读提示", () => {
    const r = derive({ ...base, algorithm: "scrypt", cost: 1000 });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("2 的幂");
  });

  it("cost 非正整数时报错", () => {
    const r = derive({ ...base, algorithm: "scrypt", cost: 0 });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("cost");
  });

  it("较大 cost 不因默认 maxmem 而失败", () => {
    const r = derive({ ...base, algorithm: "scrypt", cost: 16384 });
    expect(r.ok).toBe(true);
  });
});

describe("公共校验", () => {
  it("口令为空时报错", () => {
    const r = derive({ ...base, password: "", algorithm: "pbkdf2", iterations: 10 });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("口令不能为空");
  });

  it("盐值编码非法时错误指向盐值字段", () => {
    const r = derive({
      ...base,
      salt: "zz",
      saltEncoding: "hex",
      algorithm: "pbkdf2",
      iterations: 10,
    });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("盐值");
  });

  it("不受支持的派生算法报错", () => {
    const r = derive({ ...base, algorithm: "bcrypt" as any });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("不受支持");
  });
});
