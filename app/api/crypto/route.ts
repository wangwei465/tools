import { NextResponse } from "next/server";
import { hash } from "@/lib/crypto/hash";
import { hmac } from "@/lib/crypto/hmac";
import { encrypt, decrypt } from "@/lib/crypto/symmetric";
import { rsaEncrypt, rsaDecrypt, rsaSign, rsaVerify } from "@/lib/crypto/asymmetric";
import { derive } from "@/lib/crypto/kdf";
import { CryptoResult } from "@/lib/crypto/types";

/**
 * 加解密统一计算端点。
 *
 * POST /api/crypto  body { op, ...算法参数 }
 *   成功 → { ok: true, value }
 *   失败 → { ok: false, error }
 *
 * 为何单端点：七种操作共享同一套响应形状与错误语义，拆成七个路由会把
 * 这套公共封装复制七遍。算法逻辑全部在 lib/crypto 的纯函数里，此处只做
 * 请求解析、按 op 分发与响应封装。
 *
 * 隐私约束：请求体中的明文、密文、密钥、口令、盐值仅用于当次计算，
 * 不落库、不写日志——本文件刻意不含任何 console 输出与数据库调用。
 */

const OPS = ["hash", "hmac", "encrypt", "decrypt", "sign", "verify", "kdf"] as const;
type Op = (typeof OPS)[number];

/** 按 op 分发到对应纯函数。参数校验由各纯函数自行完成。 */
function dispatch(op: Op, body: any): CryptoResult<unknown> {
  switch (op) {
    case "hash":
      return hash(body);
    case "hmac":
      return hmac(body);
    case "encrypt":
      return body.scheme === "rsa" ? rsaEncrypt(body) : encrypt(body);
    case "decrypt":
      return body.scheme === "rsa" ? rsaDecrypt(body) : decrypt(body);
    case "sign":
      return rsaSign(body);
    case "verify":
      return rsaVerify(body);
    case "kdf":
      return derive(body);
  }
}

export async function POST(request: Request) {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "请求体不是合法 JSON" }, { status: 400 });
  }

  const op = body?.op;
  if (!op || !OPS.includes(op)) {
    return NextResponse.json(
      { ok: false, error: `不受支持的操作类型：${op ?? "(未提供)"}` },
      { status: 400 }
    );
  }

  const result = dispatch(op, body);
  if (!result.ok) {
    // 参数与算法层面的失败均为 400：调用方改参数即可重试
    return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true, value: result.value });
}
