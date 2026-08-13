import { NextResponse } from "next/server";
import { getTimeoutMs, getTokenConfig } from "@/lib/db";

/**
 * 接口代理：由服务端 GET 请求目标地址并回传响应，供"填 URL 直接比对"使用。
 *
 * 为什么走服务端代理：
 * - 规避浏览器 CORS 限制；
 * - 统一令牌只在服务端注入，不暴露到前端网络面板 / 前端内存。
 *
 * 请求体：{ url: string, headers?: Record<string,string> }
 * 响应：
 *   成功 → { ok: true, status, body }        （body 为解析后的 JSON）
 *   失败 → { ok: false, error }               （非 2xx / 超时 / 超限 / 非 JSON / 参数错误）
 */

/** 响应体大小上限（字节）。超大 JSON 会拖垮编辑器，超限直接判失败。 */
const MAX_BYTES = 5 * 1024 * 1024;

interface ProxyRequestBody {
  url?: string;
  headers?: Record<string, string>;
}

export async function POST(request: Request) {
  // 1. 解析并校验入参
  let payload: ProxyRequestBody;
  try {
    payload = (await request.json()) as ProxyRequestBody;
  } catch {
    return NextResponse.json({ ok: false, error: "请求体不是合法 JSON" }, { status: 400 });
  }

  const url = payload.url?.trim();
  if (!url) {
    return NextResponse.json({ ok: false, error: "缺少请求地址" }, { status: 400 });
  }
  if (!/^https?:\/\//i.test(url)) {
    return NextResponse.json(
      { ok: false, error: "请求地址必须以 http:// 或 https:// 开头" },
      { status: 400 }
    );
  }

  // 2. 合并 Header：统一令牌 + 单侧普通 Header，同名时单侧覆盖全局。
  //    令牌只在此处（服务端）注入，前端从不接触令牌值。
  const headers = mergeHeaders(payload.headers ?? {});

  // 3. 发起请求（带超时）
  //    每次请求实时读取超时配置（DB > 环境变量 > 默认 30 分钟），前端修改后无需重启。
  const timeoutMs = getTimeoutMs();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let upstream: Response;
  try {
    upstream = await fetch(url, {
      method: "GET",
      headers,
      signal: controller.signal,
      redirect: "follow",
    });
  } catch (err) {
    clearTimeout(timer);
    const aborted = err instanceof Error && err.name === "AbortError";
    return NextResponse.json(
      { ok: false, error: aborted ? `请求超时（>${formatTimeout(timeoutMs)}）` : "请求目标地址失败" },
      { status: 502 }
    );
  }
  clearTimeout(timer);

  // 4. 非 2xx 视为失败，不回填、不写历史
  if (!upstream.ok) {
    return NextResponse.json(
      { ok: false, error: `目标接口返回 ${upstream.status} ${upstream.statusText}`.trim() },
      { status: 502 }
    );
  }

  // 5. 读取响应体并做大小上限校验
  const text = await readWithLimit(upstream);
  if (text === null) {
    return NextResponse.json(
      { ok: false, error: `响应体超过大小上限（${MAX_BYTES / 1024 / 1024}MB）` },
      { status: 502 }
    );
  }

  // 6. 校验响应为合法 JSON：失败则不回填、不写历史
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ ok: false, error: "接口响应不是合法 JSON" }, { status: 422 });
  }

  // 7. 成功：直接返回 body，不自动写历史（由用户点"保存"显式命名后再写）
  return NextResponse.json({ ok: true, status: upstream.status, body });
}

/** 将超时毫秒数格式化为便于阅读的时长文案（整分钟显示分钟，否则显示秒）。 */
function formatTimeout(ms: number): string {
  const seconds = Math.round(ms / 1000);
  return seconds % 60 === 0 ? `${seconds / 60} 分钟` : `${seconds}s`;
}

/**
 * 合并请求 Header：先注入统一令牌，再叠加单侧普通 Header。
 * 同名时单侧覆盖全局（局部优先）——大小写不敏感地比较 Header 名。
 * 令牌值仅在此读取并注入，绝不返回给前端。
 */
function mergeHeaders(sideHeaders: Record<string, string>): Record<string, string> {
  const merged: Record<string, string> = {};

  // 统一令牌（token 为空则不注入）
  const cfg = getTokenConfig();
  if (cfg.token.trim()) {
    const headerName = cfg.headerName.trim() || "Authorization";
    const value = cfg.prefix.trim() ? `${cfg.prefix.trim()} ${cfg.token}` : cfg.token;
    merged[headerName] = value;
  }

  // 单侧普通 Header 覆盖：若与令牌 Header 同名（忽略大小写），删除令牌项后写入单侧值
  for (const [rawKey, rawValue] of Object.entries(sideHeaders)) {
    const key = rawKey.trim();
    if (!key) continue;
    const dup = Object.keys(merged).find((k) => k.toLowerCase() === key.toLowerCase());
    if (dup) delete merged[dup];
    merged[key] = rawValue;
  }

  return merged;
}

/**
 * 读取响应体文本，累计字节超过上限则中止并返回 null。
 * 逐块累计避免一次性缓冲超大响应。
 */
async function readWithLimit(res: Response): Promise<string | null> {
  if (!res.body) return await res.text();

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      total += value.byteLength;
      if (total > MAX_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  }
  return Buffer.concat(chunks).toString("utf-8");
}
