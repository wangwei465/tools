import { NextResponse } from "next/server";
import type { WireEnvelope, WireBody } from "@/components/api-client/types";

/**
 * 通用请求代理：代表前端向任意目标接口发起任意方法的请求，规避浏览器 CORS。
 *
 * 与旧 `/api/proxy`（比对特供）的根本区别：
 * - 透传任意 HTTP 方法与任意 Body（form-data 文件走 base64 还原）；
 * - 不做 JSON.parse 校验、非 2xx 不判失败——响应原样回传，由前端按 content-type 展示；
 * - 返回完整响应元信息 { status, statusText, headers, body, timeMs, size }。
 *
 * 入参：统一 JSON 信封 { method, url, headers, bodyType, body }
 * 成功（含目标返回 4xx/5xx）→ { ok:true, status, statusText, headers, body, timeMs, size, contentType }
 * 代理层失败（网络错误/超时/超限/参数错误）→ { ok:false, error }
 */

/** 响应体大小上限（字节）。 */
const MAX_BYTES = 10 * 1024 * 1024;
/** 请求超时（毫秒）。 */
const TIMEOUT_MS = 60 * 1000;

const ALLOWED_METHODS = new Set([
  "GET",
  "POST",
  "PUT",
  "DELETE",
  "PATCH",
  "HEAD",
  "OPTIONS",
]);

export async function POST(request: Request) {
  // 1. 解析信封
  let env: Partial<WireEnvelope>;
  try {
    env = (await request.json()) as Partial<WireEnvelope>;
  } catch {
    return NextResponse.json({ ok: false, error: "请求体不是合法 JSON" }, { status: 400 });
  }

  const method = String(env.method ?? "GET").toUpperCase();
  const url = String(env.url ?? "").trim();
  if (!ALLOWED_METHODS.has(method)) {
    return NextResponse.json({ ok: false, error: `不支持的方法：${method}` }, { status: 400 });
  }
  if (!/^https?:\/\//i.test(url)) {
    return NextResponse.json(
      { ok: false, error: "请求地址必须以 http:// 或 https:// 开头" },
      { status: 400 }
    );
  }

  // 2. 组装 Header
  const headers = new Headers();
  for (const [k, v] of Object.entries(env.headers ?? {})) {
    if (k.trim()) headers.set(k, String(v));
  }

  // 3. 组装 Body（按 bodyType 重组）
  const bodyType = env.bodyType ?? "none";
  let body: BodyInit | undefined;
  if (!["GET", "HEAD"].includes(method)) {
    body = buildBody(bodyType, env.body, headers);
  }

  // 4. 发起请求（AbortController 超时 + 打点计时）
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const t0 = Date.now();
  let upstream: Response;
  try {
    upstream = await fetch(url, {
      method,
      headers,
      body,
      signal: controller.signal,
      redirect: "follow",
    });
  } catch (err) {
    clearTimeout(timer);
    const aborted = err instanceof Error && err.name === "AbortError";
    return NextResponse.json(
      { ok: false, error: aborted ? `请求超时（>${TIMEOUT_MS / 1000}s）` : "请求目标地址失败" },
      { status: 200 }
    );
  }
  clearTimeout(timer);
  const timeMs = Date.now() - t0;

  // 5. 读取响应体（大小上限）——不做 JSON 校验，原样文本
  const text = await readWithLimit(upstream);
  if (text === null) {
    return NextResponse.json(
      { ok: false, error: `响应体超过大小上限（${MAX_BYTES / 1024 / 1024}MB）` },
      { status: 200 }
    );
  }

  // 6. 响应 Header → 普通对象
  const respHeaders: Record<string, string> = {};
  upstream.headers.forEach((v, k) => {
    respHeaders[k] = v;
  });

  // 7. 原样返回（非 2xx 也在此正常返回，不判失败）
  return NextResponse.json({
    ok: true,
    status: upstream.status,
    statusText: upstream.statusText,
    headers: respHeaders,
    body: text,
    timeMs,
    size: Buffer.byteLength(text, "utf-8"),
    contentType: upstream.headers.get("content-type") ?? "",
  });
}

/**
 * 按 bodyType 重组请求体。
 * - raw：原样字符串（content-type 由前端 headers 提供）
 * - urlencoded：URLSearchParams
 * - form-data：Node FormData（文件从 base64 还原）；必须删除手动 content-type，
 *   让 fetch 自动带 multipart boundary。
 */
function buildBody(
  bodyType: string,
  wire: WireBody | undefined,
  headers: Headers
): BodyInit | undefined {
  if (!wire || wire.kind === "none") return undefined;

  if (wire.kind === "raw") {
    return wire.text ?? "";
  }

  if (wire.kind === "urlencoded") {
    const usp = new URLSearchParams();
    for (const [k, v] of wire.pairs ?? []) usp.append(k, v);
    return usp;
  }

  if (wire.kind === "form-data") {
    // 关键：删除任何手动 content-type，否则会覆盖 multipart boundary 导致目标无法解析
    headers.delete("content-type");
    const fd = new FormData();
    for (const f of wire.fields ?? []) {
      if (f.kind === "file" && f.fileBase64 != null) {
        const buf = Buffer.from(f.fileBase64, "base64");
        fd.append(f.key, new Blob([buf]), f.fileName ?? "file");
      } else {
        fd.append(f.key, f.value ?? "");
      }
    }
    return fd;
  }

  return undefined;
}

/**
 * 读取响应体文本，累计字节超过上限则中止并返回 null。
 * 逐块累计，避免一次性缓冲超大响应。
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
