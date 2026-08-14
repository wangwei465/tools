import { describe, it, expect } from "vitest";
import { POST } from "./route";

/**
 * /api/signature 的契约回归测试。
 *
 * 存在意义：本工具的 MD5 计算将被收编到 lib/crypto 的公共实现，
 * 该重构 MUST NOT 改变签名结果与响应形状。这里用固定输入锁死
 * 期望签名值（md5("1700000000000" + "app-123" + "secret-xyz") 小写），
 * 重构前后各跑一次即可证明行为一致。
 */

/** 构造一次 POST 调用并取回 JSON 响应体。 */
async function post(body: unknown) {
  const res = await POST(
    new Request("http://localhost/api/signature", {
      method: "POST",
      body: JSON.stringify(body),
    })
  );
  return { status: res.status, json: await res.json() };
}

describe("/api/signature 契约", () => {
  it("固定输入产出固定签名", async () => {
    const { status, json } = await post({
      timestamp: "1700000000000",
      appId: "app-123",
      appSecret: "secret-xyz",
    });
    expect(status).toBe(200);
    expect(json).toEqual({
      ok: true,
      signature: "d2df68db5ad8afd25adda61f9ae63afb",
    });
  });

  it("签名为小写十六进制", async () => {
    const { json } = await post({
      timestamp: "1",
      appId: "A",
      appSecret: "B",
    });
    expect(json.signature).toMatch(/^[0-9a-f]{32}$/);
  });

  it("数字类型的时间戳按字符串拼接，与字符串入参等价", async () => {
    const a = await post({ timestamp: 1700000000000, appId: "app-123", appSecret: "secret-xyz" });
    const b = await post({ timestamp: "1700000000000", appId: "app-123", appSecret: "secret-xyz" });
    expect(a.json.signature).toBe(b.json.signature);
  });

  it("字段缺失返回 400 与可读错误", async () => {
    const { status, json } = await post({ timestamp: "1", appId: "" });
    expect(status).toBe(400);
    expect(json.ok).toBe(false);
    expect(json.error).toContain("不能为空");
  });

  it("请求体非法 JSON 返回 400", async () => {
    const res = await POST(
      new Request("http://localhost/api/signature", { method: "POST", body: "not-json" })
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("合法 JSON");
  });
});
