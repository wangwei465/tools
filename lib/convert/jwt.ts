import { ConvertResult, ok, err, errMessage } from "./result";

/**
 * JWT 解析——仅解码 header / payload，不校验签名。
 *
 * JWT 结构：base64url(header).base64url(payload).signature
 * header 与 payload 为 Base64URL 编码的 JSON；signature 为二进制签名（本工具不处理）。
 * 安全提示：本工具不验证签名，解析结果不代表 token 合法有效。
 */
export interface JwtParts {
  /** 格式化后的 header JSON */
  header: string;
  /** 格式化后的 payload JSON */
  payload: string;
  /** 原始签名段（未解码） */
  signature: string;
}

/** Base64URL(无填充) → UTF-8 文本。 */
function decodeSegment(seg: string): string {
  let normalized = seg.replace(/-/g, "+").replace(/_/g, "/");
  const pad = normalized.length % 4;
  if (pad === 2) normalized += "==";
  else if (pad === 3) normalized += "=";
  else if (pad === 1) throw new Error("段长度非法");
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

/** 解码一个段并格式化为 JSON 文本。 */
function segmentToJson(seg: string, label: string): string {
  const text = decodeSegment(seg);
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    throw new Error(`${label} 不是合法 JSON`);
  }
}

/** 解析 JWT。段数不足或含非法 Base64URL / 非法 JSON 时返回错误。 */
export function decodeJwt(input: string): ConvertResult<JwtParts> {
  const token = input.trim();
  if (!token) return err("请输入 JWT");

  const parts = token.split(".");
  if (parts.length !== 3) {
    return err(`JWT 应为三段（header.payload.signature），当前为 ${parts.length} 段`);
  }
  const [h, p, s] = parts;
  if (!h || !p) return err("header 或 payload 段为空");

  try {
    return ok<JwtParts>({
      header: segmentToJson(h, "header"),
      payload: segmentToJson(p, "payload"),
      signature: s,
    });
  } catch (e) {
    return err(`解析失败：${errMessage(e)}`);
  }
}
