import type { RequestDraft, WireEnvelope, WireBody, KV } from "./types";
import { BODYLESS_METHODS } from "./types";
import { substituteDraft } from "./vars";

/**
 * 请求组装管线：RequestDraft → wire 信封（发给 /api/request）。
 *
 * 管线顺序（架构脊梁）：
 *   1. 变量替换 {{var}}   ← ③ 有 vars 则插值，否则直通（①/④ 不传 vars）
 *   2. Auth 注入 → header / query
 *   3. Query 合并到 URL
 *   4. Body 序列化
 */
export function assembleRequest(draft: RequestDraft, vars?: Map<string, string>): WireEnvelope {
  // 1. 变量替换 —— 有 vars 则对 url/params/headers/body/auth 做 {{var}} 插值；否则直通
  const d = vars ? substituteDraft(draft, vars).draft : draft;

  // 2. Auth 注入 → headers / query
  const headers: Record<string, string> = {};
  for (const h of d.headers) {
    if (h.enabled && h.key.trim()) headers[h.key] = h.value;
  }
  const authQuery: Array<[string, string]> = [];
  applyAuth(d, headers, authQuery);

  // 3. Query 合并：draft.url 已含 params 的 query（表格改动实时写回），此处叠加 auth 的 apikey-in-query
  const url = appendQuery(d.url.trim(), authQuery);

  // 4. Body 序列化
  const { bodyType, body, contentType } = serializeBody(d);
  if (contentType && !hasHeaderCI(headers, "content-type")) {
    headers["Content-Type"] = contentType;
  }

  return { method: d.method, url, headers, bodyType, body };
}

function applyAuth(
  d: RequestDraft,
  headers: Record<string, string>,
  authQuery: Array<[string, string]>
): void {
  const a = d.auth;
  if (a.type === "bearer" && a.bearerToken.trim()) {
    headers["Authorization"] = `Bearer ${a.bearerToken.trim()}`;
  } else if (a.type === "basic") {
    headers["Authorization"] = `Basic ${utf8Base64(`${a.basicUser}:${a.basicPassword}`)}`;
  } else if (a.type === "apikey" && a.apiKeyName.trim()) {
    if (a.apiKeyIn === "query") authQuery.push([a.apiKeyName, a.apiKeyValue]);
    else headers[a.apiKeyName] = a.apiKeyValue;
  }
}

/** UTF-8 安全的 base64（btoa 不能直接处理非 ASCII）。 */
function utf8Base64(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function appendQuery(url: string, extra: Array<[string, string]>): string {
  if (extra.length === 0) return url;
  const qs = extra
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
  return url + (url.includes("?") ? "&" : "?") + qs;
}

function serializeBody(d: RequestDraft): {
  bodyType: WireEnvelope["bodyType"];
  body: WireBody;
  contentType?: string;
} {
  const b = d.body;
  if (BODYLESS_METHODS.has(d.method) || b.type === "none") {
    return { bodyType: "none", body: { kind: "none" } };
  }
  if (b.type === "raw") {
    return {
      bodyType: "raw",
      body: { kind: "raw", text: b.raw },
      contentType: "application/json",
    };
  }
  if (b.type === "urlencoded") {
    const pairs = b.urlencoded
      .filter((kv) => kv.enabled && kv.key.trim())
      .map((kv) => [kv.key, kv.value] as [string, string]);
    return {
      bodyType: "urlencoded",
      body: { kind: "urlencoded", pairs },
      contentType: "application/x-www-form-urlencoded",
    };
  }
  // form-data：不设 content-type，代理端由 FormData 自动带 boundary
  const fields = b.formData
    .filter((f) => f.enabled && f.key.trim())
    .map((f) =>
      f.kind === "file"
        ? { key: f.key, kind: "file" as const, fileName: f.fileName, fileBase64: f.fileBase64 }
        : { key: f.key, kind: "text" as const, value: f.value }
    );
  return { bodyType: "form-data", body: { kind: "form-data", fields } };
}

function hasHeaderCI(headers: Record<string, string>, name: string): boolean {
  const lower = name.toLowerCase();
  return Object.keys(headers).some((k) => k.toLowerCase() === lower);
}

/* ─── URL ⇄ Query params 同步工具（以 URL query 为真相源）───────── */

/** 把 params（enabled）序列化进 url 的 query 段，保留 path 与 hash。用户改表格时调用。 */
export function paramsToUrl(url: string, params: KV[]): string {
  const hashIdx = url.indexOf("#");
  const hash = hashIdx >= 0 ? url.slice(hashIdx) : "";
  const noHash = hashIdx >= 0 ? url.slice(0, hashIdx) : url;
  const qIdx = noHash.indexOf("?");
  const base = qIdx >= 0 ? noHash.slice(0, qIdx) : noHash;

  const qs = params
    .filter((p) => p.enabled && p.key.trim())
    .map((p) => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`)
    .join("&");

  return base + (qs ? "?" + qs : "") + hash;
}

/** 解析 url 的 query 段为 params 行。URL 失焦时调用。 */
export function urlToParams(url: string): KV[] {
  const hashIdx = url.indexOf("#");
  const noHash = hashIdx >= 0 ? url.slice(0, hashIdx) : url;
  const qIdx = noHash.indexOf("?");
  if (qIdx < 0) return [];
  const qs = noHash.slice(qIdx + 1);
  if (!qs) return [];
  return qs
    .split("&")
    .filter(Boolean)
    .map((pair) => {
      const eq = pair.indexOf("=");
      const k = eq >= 0 ? pair.slice(0, eq) : pair;
      const v = eq >= 0 ? pair.slice(eq + 1) : "";
      return { key: safeDecode(k), value: safeDecode(v), enabled: true };
    });
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s.replace(/\+/g, " "));
  } catch {
    return s;
  }
}
