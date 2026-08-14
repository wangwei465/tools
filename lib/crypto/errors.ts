import { errMessage } from "./types";

/**
 * 底层加密异常 → 可读中文提示。
 *
 * node:crypto 的报错直接来自 OpenSSL，形如
 * `error:1C800064:Provider routines::bad decrypt`，对使用者毫无意义。
 * 这里按特征串归类为四类高频失败，未能归类的**不吞掉**，回落到
 * 原始 message，以免把真正的未知问题掩盖成"未知错误"。
 */

interface Rule {
  /** 命中任一关键词即归类（统一转小写后匹配） */
  match: string[];
  message: string;
}

const RULES: Rule[] = [
  {
    // OpenSSL 对认证标签校验失败与 padding 失败共用 "bad decrypt"，
    // GCM 场景另有 "unable to authenticate"，故两者都归到认证/密钥类提示
    match: ["unable to authenticate", "unsupported state or unable to authenticate"],
    message: "认证标签校验失败：密钥、IV、密文或认证标签不匹配，数据可能已被篡改",
  },
  {
    match: ["bad decrypt", "wrong final block length", "bad padding", "padding"],
    message: "解密失败：padding 校验未通过，通常是密钥、IV 或密文不正确",
  },
  {
    match: ["invalid key length", "invalid iv length"],
    message: "密钥或 IV 长度不符合所选算法的要求",
  },
  {
    match: [
      "no start line",
      "pem",
      "asn1",
      "unsupported",
      "decoder routines",
      "invalid keydata",
      "bad end line",
    ],
    message: "密钥 PEM 格式无法解析：请确认粘贴的是完整的 PEM 文本（含 BEGIN/END 行）",
  },
  {
    match: ["oaep", "data too large for key size", "digest too big"],
    message: "数据长度超出该密钥可处理的上限：RSA 单次加密的明文长度受密钥位数限制",
  },
];

/** 把底层异常转成可读中文；无法归类时回落原始 message。 */
export function readableError(e: unknown, fallbackPrefix = "计算失败"): string {
  const raw = errMessage(e);
  const lower = raw.toLowerCase();
  for (const rule of RULES) {
    if (rule.match.some((kw) => lower.includes(kw))) return rule.message;
  }
  return `${fallbackPrefix}：${raw}`;
}
