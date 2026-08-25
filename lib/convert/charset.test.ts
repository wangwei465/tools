import { describe, it, expect } from "vitest";
import {
  inspectChars,
  restoreMojibake,
  decodeHexBytes,
  isEncodingSupported,
  MAX_CHARS,
} from "./charset";

/** 把文本按 UTF-8 编码后再按 wrong 编码解读，制造真实乱码。 */
function mojibake(text: string, wrong: string): string {
  return new TextDecoder(wrong).decode(new TextEncoder().encode(text));
}

/** 真正的 ISO-8859-1 误读：每个字节直接当作码位。 */
function mojibakeLatin1(text: string): string {
  return String.fromCharCode(...new TextEncoder().encode(text));
}

describe("逐字符编码视图", () => {
  it("中文字符的各种表示", () => {
    const c = inspectChars("中").chars[0];
    expect(c.codePoint).toBe(0x4e2d);
    expect(c.codePointHex).toBe("U+4E2D");
    expect(c.utf8).toBe("E4 B8 AD");
    expect(c.utf16).toBe("4E2D");
    expect(c.latin1).toBe("—");
    expect(c.escapeU).toBe("\\u4E2D");
    expect(c.percent).toBe("%E4%B8%AD");
    expect(c.htmlEntity).toBe("&#x4E2D;");
  });

  it("ASCII 字符的 Latin-1 字节可用", () => {
    const c = inspectChars("A").chars[0];
    expect(c.codePointHex).toBe("U+0041");
    expect(c.utf8).toBe("41");
    expect(c.latin1).toBe("41");
    expect(c.percent).toBe("%41");
  });

  it("emoji 按代理对正确展开", () => {
    const view = inspectChars("😀");
    // 按码位迭代：一个 emoji 是一个字符而非两个
    expect(view.chars).toHaveLength(1);
    expect(view.total).toBe(1);
    const c = view.chars[0];
    expect(c.codePoint).toBe(0x1f600);
    expect(c.codePointHex).toBe("U+1F600");
    expect(c.utf8).toBe("F0 9F 98 80");
    expect(c.utf16).toBe("D83D DE00");
    expect(c.escapeU).toBe("\\uD83D\\uDE00");
    expect(c.latin1).toBe("—");
  });

  it("XML 特殊字符给出命名实体", () => {
    expect(inspectChars("&").chars[0].htmlEntity).toBe("&amp;");
    expect(inspectChars("<").chars[0].htmlEntity).toBe("&lt;");
    expect(inspectChars('"').chars[0].htmlEntity).toBe("&quot;");
  });

  it("混合文本逐字符展开", () => {
    const view = inspectChars("a中");
    expect(view.chars.map((c) => c.char)).toEqual(["a", "中"]);
    expect(view.truncated).toBe(false);
  });

  it("空输入不报错", () => {
    const view = inspectChars("");
    expect(view.chars).toEqual([]);
    expect(view.total).toBe(0);
  });

  it("超长输入被截断并标记", () => {
    const view = inspectChars("字".repeat(MAX_CHARS + 100));
    expect(view.truncated).toBe(true);
    expect(view.chars).toHaveLength(MAX_CHARS);
    expect(view.total).toBe(MAX_CHARS + 100);
  });
});

describe("乱码还原", () => {
  it("UTF-8 字节被当作 GBK 读", () => {
    const garbled = mojibake("中文测试", "gbk");
    expect(garbled).not.toBe("中文测试");
    const r = restoreMojibake(garbled);
    expect(r.ok).toBe(true);
    const top = r.value!.candidates[0];
    expect(top.text).toBe("中文测试");
    expect(top.label).toContain("GBK");
    expect(top.lossy).toBe(false);
  });

  it("UTF-8 字节被当作 Latin-1 读", () => {
    const garbled = mojibakeLatin1("中文测试");
    const r = restoreMojibake(garbled);
    expect(r.ok).toBe(true);
    expect(r.value!.candidates.some((c) => c.text === "中文测试")).toBe(true);
  });

  it("正确结果排在候选首位", () => {
    const r = restoreMojibake(mojibake("订单编号已生成", "gbk"));
    expect(r.value!.candidates[0].text).toContain("订单编号已生");
    expect(r.value!.candidates[0].label).toContain("GBK");
  });

  it("字节数为奇数时末字丢失但其余可还原", () => {
    // 7 个汉字 = 21 个 UTF-8 字节，按双字节的 GBK 读必然落单一个字节，
    // 该字节在误解码时已被替换成 U+FFFD，信息不可能找回——能还原前 6 字即为最优
    const r = restoreMojibake(mojibake("订单编号已生成", "gbk"));
    const top = r.value!.candidates[0];
    expect(top.text).toBe("订单编号已生�");
    expect(top.lossy).toBe(true);
  });

  it("字节数为偶数时可完整还原", () => {
    // 4 个汉字 = 12 个 UTF-8 字节，按 GBK 读正好 6 个字符，无落单字节
    const r = restoreMojibake(mojibake("订单编号", "gbk"));
    const top = r.value!.candidates[0];
    expect(top.text).toBe("订单编号");
    expect(top.lossy).toBe(false);
    expect(top.score).toBeGreaterThan(90);
  });

  it("含 U+FFFD 的输入被标注为不可逆", () => {
    // GBK 字节被按 UTF-8 读，无效序列已被替换成 U+FFFD，信息不可能找回
    const gbkBytes = new Uint8Array([0xd6, 0xd0, 0xce, 0xc4]); // 「中文」的 GBK 字节
    const garbled = new TextDecoder("utf-8").decode(gbkBytes);
    expect(garbled).toContain("�");
    const r = restoreMojibake(garbled);
    expect(r.ok).toBe(true);
    expect(r.value!.inputLossy).toBe(true);
    expect(r.value!.candidates.every((c) => c.lossy)).toBe(true);
  });

  it("纯 ASCII 文本没有可用候选时给出说明", () => {
    // 各候选编码下 ASCII 字节都原样往返，还原结果与输入无异，没有信息量
    const r = restoreMojibake("hello world");
    expect(r.ok).toBe(false);
    expect(r.error).toContain("没有可用的还原候选");
  });

  it("emoji 等非乱码输入不崩溃", () => {
    const r = restoreMojibake("😀😀😀");
    expect(r.ok === true || r.ok === false).toBe(true);
    if (r.ok) expect(Array.isArray(r.value!.candidates)).toBe(true);
  });

  it("空输入报错", () => {
    expect(restoreMojibake("   ").ok).toBe(false);
  });

  it("当前环境支持全部候选编码时无跳过项", () => {
    const r = restoreMojibake(mojibake("中文", "gbk"));
    // Node 与主流浏览器均支持 gbk/gb18030/big5；若某环境缺失应出现在 skipped 而非静默丢失
    expect(r.value!.skipped).toEqual([]);
  });

  it("每个候选都带可信度评分", () => {
    const r = restoreMojibake(mojibake("中文", "gbk"));
    for (const c of r.value!.candidates) {
      expect(c.score).toBeGreaterThanOrEqual(0);
      expect(c.score).toBeLessThanOrEqual(100);
    }
  });

  it("候选按可信度降序排列", () => {
    const scores = restoreMojibake(mojibake("中文测试数据", "gbk")).value!.candidates.map((c) => c.score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
  });
});

describe("编码支持探测", () => {
  it("常见编码可用", () => {
    expect(isEncodingSupported("gbk")).toBe(true);
    expect(isEncodingSupported("utf-8")).toBe(true);
  });

  it("不存在的编码返回 false", () => {
    expect(isEncodingSupported("not-an-encoding")).toBe(false);
  });
});

describe("十六进制字节解码", () => {
  it("GBK 字节解为中文", () => {
    expect(decodeHexBytes("D6 D0 CE C4", "gbk").value).toBe("中文");
  });

  it("接受多种分隔与前缀写法", () => {
    expect(decodeHexBytes("d6d0cec4", "gbk").value).toBe("中文");
    expect(decodeHexBytes("0xD6,0xD0,0xCE,0xC4", "gbk").value).toBe("中文");
    expect(decodeHexBytes("\\xD6\\xD0\\xCE\\xC4", "gbk").value).toBe("中文");
    expect(decodeHexBytes("D6 D0\nCE C4", "gbk").value).toBe("中文");
  });

  it("按 UTF-8 解码", () => {
    expect(decodeHexBytes("E4 B8 AD", "utf-8").value).toBe("中");
  });

  it("空输入报错", () => {
    expect(decodeHexBytes("   ", "gbk").ok).toBe(false);
  });

  it("非十六进制字符报错", () => {
    const r = decodeHexBytes("D6 ZZ", "gbk");
    expect(r.ok).toBe(false);
    expect(r.error).toContain("非十六进制");
  });

  it("奇数位报错并给出实际长度", () => {
    const r = decodeHexBytes("D6 D0 C", "gbk");
    expect(r.ok).toBe(false);
    expect(r.error).toContain("5");
  });

  it("不支持的编码报错", () => {
    expect(decodeHexBytes("41", "not-an-encoding").ok).toBe(false);
  });
});
