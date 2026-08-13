import type { RequestDraft, KV, BodyState, FormField, HttpMethod } from "./types";
import { emptyRequest, HTTP_METHODS } from "./types";
import { urlToParams } from "./assemble";

/**
 * cURL 导入解析器（api-curl-import ④a）——组装管线的「逆运算」。
 *
 * 自研轻量实现（少依赖）：tokenizer 处理引号 / `\` 续行 / 空白，
 * 解析常见选项 → 中间结构 → 反推 `RequestDraft`，交回 ① 的正常管线。
 * 聚焦常见选项，未知选项忽略并计入 unknownOptions（由 UI 提示）。
 */

export interface CurlParseResult {
  draft: RequestDraft;
  /** 未识别的选项（已忽略，供 UI 提示）。 */
  unknownOptions: string[];
}

/** 解析失败（畸形 / 不完整 curl）——UI 捕获后提示，不破坏当前 tab。 */
export class CurlParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CurlParseError";
  }
}

/* ─── 2.1 tokenizer：引号 / `\` 续行 / 空白分词 ─────────────── */

/**
 * 将 curl 命令切分为 token。
 * - 单引号 `'...'`：内部字面量，无转义。
 * - 双引号 `"..."`：支持 `\" \\ \$ \`` 转义。
 * - `\` + 换行：续行，吞掉。
 * - `\` + 其他字符：保留该字符字面量（shell 转义）。
 * - 空白（空格 / Tab / 换行）：分隔符。
 */
export function tokenizeCurl(input: string): string[] {
  const tokens: string[] = [];
  const n = input.length;
  let cur = "";
  let hasToken = false; // 区分「空 token」与「无 token」
  let i = 0;

  const flush = () => {
    if (hasToken) {
      tokens.push(cur);
      cur = "";
      hasToken = false;
    }
  };

  while (i < n) {
    const c = input[i];

    if (c === "\\") {
      const next = input[i + 1];
      if (next === "\n") {
        i += 2;
        continue;
      }
      if (next === "\r" && input[i + 2] === "\n") {
        i += 3;
        continue;
      }
      if (next !== undefined) {
        cur += next;
        hasToken = true;
        i += 2;
        continue;
      }
      i += 1;
      continue;
    }

    if (c === "'") {
      hasToken = true;
      i++;
      while (i < n && input[i] !== "'") {
        cur += input[i];
        i++;
      }
      i++; // 跳过闭合引号
      continue;
    }

    if (c === '"') {
      hasToken = true;
      i++;
      while (i < n && input[i] !== '"') {
        const ch = input[i];
        const nx = input[i + 1];
        if (ch === "\\" && (nx === '"' || nx === "\\" || nx === "$" || nx === "`")) {
          cur += nx;
          i += 2;
        } else {
          cur += ch;
          i++;
        }
      }
      i++; // 跳过闭合引号
      continue;
    }

    if (c === " " || c === "\t" || c === "\n" || c === "\r") {
      flush();
      i++;
      continue;
    }

    cur += c;
    hasToken = true;
    i++;
  }

  flush();
  return tokens;
}

/* ─── 2.2 + 2.3 选项解析 → 中间结构 → 反推 RequestDraft ─────── */

export function parseCurl(input: string): CurlParseResult {
  const text = input.trim();
  if (!text) throw new CurlParseError("请粘贴 cURL 命令");

  const tokens = tokenizeCurl(text);
  if (tokens.length === 0) throw new CurlParseError("无法解析：内容为空");

  // 起始位置：跳过前导的 `curl`（容错 `/usr/bin/curl` 等）
  let start = 0;
  const head = tokens[0].toLowerCase();
  if (head === "curl" || head.endsWith("/curl") || head.endsWith("\\curl")) start = 1;

  // 中间结构
  let method: string | null = null;
  let url = "";
  let urlSet = false;
  const headers: KV[] = [];
  const data: string[] = []; // -d / --data / --data-raw / --data-binary
  const dataUrlencode: string[] = []; // --data-urlencode
  const forms: FormField[] = []; // -F / --form
  let basicUser = "";
  let basicPass = "";
  let hasBasic = false;
  let getFlag = false; // -G / --get：data 转为 query
  let headOnly = false; // -I / --head
  const unknown: string[] = [];

  const addHeaderRaw = (s: string) => {
    const idx = s.indexOf(":");
    if (idx < 0) return; // 无冒号：忽略（如 `Header;` 清空写法）
    const key = s.slice(0, idx).trim();
    const value = s.slice(idx + 1).trim();
    if (key) headers.push({ key, value, enabled: true });
  };
  const addHeaderKV = (key: string, value: string) =>
    headers.push({ key, value, enabled: true });
  const setBasic = (s: string) => {
    const i = s.indexOf(":");
    basicUser = i >= 0 ? s.slice(0, i) : s;
    basicPass = i >= 0 ? s.slice(i + 1) : "";
    hasBasic = true;
  };
  const setUrl = (s: string) => {
    if (!urlSet) {
      url = s;
      urlSet = true;
    }
  };

  for (let k = start; k < tokens.length; k++) {
    const t = tokens[k];
    const need = (): string => {
      const v = tokens[k + 1];
      if (v === undefined) throw new CurlParseError(`选项 ${t} 缺少参数`);
      k++;
      return v;
    };

    if (t.startsWith("--")) {
      const eq = t.indexOf("=");
      const name = eq >= 0 ? t.slice(0, eq) : t;
      const inlineVal = eq >= 0 ? t.slice(eq + 1) : null;
      const longArg = (): string => (inlineVal !== null ? inlineVal : need());
      switch (name) {
        case "--request":
          method = longArg().toUpperCase();
          break;
        case "--header":
          addHeaderRaw(longArg());
          break;
        case "--url":
          setUrl(longArg());
          break;
        case "--user":
          setBasic(longArg());
          break;
        case "--user-agent":
          addHeaderKV("User-Agent", longArg());
          break;
        case "--referer":
          addHeaderKV("Referer", longArg());
          break;
        case "--cookie":
          addHeaderKV("Cookie", longArg());
          break;
        case "--data":
        case "--data-raw":
        case "--data-ascii":
        case "--data-binary":
          data.push(longArg());
          break;
        case "--data-urlencode":
          dataUrlencode.push(longArg());
          break;
        case "--form":
        case "--form-string":
          forms.push(parseFormField(longArg()));
          break;
        case "--get":
          getFlag = true;
          break;
        case "--head":
          headOnly = true;
          break;
        // 无参数、对请求语义无影响：静默忽略
        case "--compressed":
        case "--location":
        case "--silent":
        case "--show-error":
        case "--insecure":
        case "--include":
        case "--verbose":
        case "--globoff":
        case "--progress-bar":
        case "--fail":
        case "--no-buffer":
        case "--http1.0":
        case "--http1.1":
        case "--http2":
          break;
        default:
          unknown.push(name);
          break;
      }
      continue;
    }

    if (t.startsWith("-") && t.length > 1) {
      // 短选项簇：逐字符解析（支持 `-sSL`、`-XPOST` 内联参数）
      let consumedRest = false;
      for (let j = 1; j < t.length && !consumedRest; j++) {
        const ch = t[j];
        const inline = t.slice(j + 1);
        const arg = (): string => (inline !== "" ? inline : need());
        switch (ch) {
          case "X":
            method = arg().toUpperCase();
            consumedRest = true;
            break;
          case "H":
            addHeaderRaw(arg());
            consumedRest = true;
            break;
          case "d":
            data.push(arg());
            consumedRest = true;
            break;
          case "F":
            forms.push(parseFormField(arg()));
            consumedRest = true;
            break;
          case "u":
            setBasic(arg());
            consumedRest = true;
            break;
          case "A":
            addHeaderKV("User-Agent", arg());
            consumedRest = true;
            break;
          case "e":
            addHeaderKV("Referer", arg());
            consumedRest = true;
            break;
          case "b":
            addHeaderKV("Cookie", arg());
            consumedRest = true;
            break;
          case "o":
            arg(); // 忽略输出文件参数
            consumedRest = true;
            break;
          case "G":
            getFlag = true;
            break;
          case "I":
            headOnly = true;
            break;
          // 无参数、对请求语义无影响：静默忽略
          case "s":
          case "S":
          case "L":
          case "k":
          case "i":
          case "v":
          case "#":
          case "g":
          case "0":
          case "J":
          case "f":
          case "n":
            break;
          default:
            unknown.push("-" + ch);
            break;
        }
      }
      continue;
    }

    // 非选项：URL（取首个）
    setUrl(t);
  }

  // ── URL：必需 ──
  url = url.trim();
  if (!url) throw new CurlParseError("未找到请求地址（URL）");

  // ── Body 反推 + -G 处理 ──
  let body: BodyState = emptyRequest().body;
  const ctype = findHeaderCI(headers, "content-type");

  if (getFlag) {
    // -G：data / data-urlencode 并入 query，不作为 body
    const pairs: KV[] = [
      ...data.flatMap(parseFormPairs),
      ...dataUrlencode.flatMap(parseFormPairs),
    ];
    url = appendQueryToUrl(url, pairs);
  } else if (forms.length > 0) {
    body = { type: "form-data", raw: "", formData: forms, urlencoded: [] };
  } else if (dataUrlencode.length > 0 && data.length === 0) {
    const pairs = dataUrlencode.flatMap(parseFormPairs);
    body = { type: "urlencoded", raw: "", formData: [], urlencoded: pairs };
  } else if (data.length > 0 || dataUrlencode.length > 0) {
    const joined = [...data, ...dataUrlencode].join("&");
    if ((ctype && ctype.includes("application/json")) || (!ctype && looksLikeJson(joined))) {
      body = { type: "raw", raw: joined, formData: [], urlencoded: [] };
    } else {
      body = { type: "urlencoded", raw: "", formData: [], urlencoded: parseFormPairs(joined) };
    }
  }

  // ── Method 反推 ──
  const hasBody = forms.length > 0 || data.length > 0 || dataUrlencode.length > 0;
  let resolvedMethod: string;
  if (headOnly) resolvedMethod = "HEAD";
  else if (method) resolvedMethod = method;
  else resolvedMethod = hasBody && !getFlag ? "POST" : "GET";
  const finalMethod: HttpMethod = (HTTP_METHODS as string[]).includes(resolvedMethod)
    ? (resolvedMethod as HttpMethod)
    : hasBody && !getFlag
      ? "POST"
      : "GET";

  // ── Auth 反推 ──
  const auth = emptyRequest().auth;
  if (hasBasic) {
    auth.type = "basic";
    auth.basicUser = basicUser;
    auth.basicPassword = basicPass;
  }

  const draft: RequestDraft = {
    method: finalMethod,
    url,
    params: urlToParams(url), // URL → Query params 拆分（复用 ①）
    headers,
    body,
    auth,
  };

  return { draft, unknownOptions: dedupe(unknown) };
}

/* ─── 辅助 ──────────────────────────────────────────────── */

/** 解析 `-F` 字段：`name=value`（文本）或 `name=@path` / `name=<path`（文件，保留路径占位）。 */
function parseFormField(s: string): FormField {
  const eq = s.indexOf("=");
  const key = eq >= 0 ? s.slice(0, eq) : s;
  const val = eq >= 0 ? s.slice(eq + 1) : "";
  if (val.startsWith("@") || val.startsWith("<")) {
    // 文件字段：去掉引导符与 `;type=...` 等修饰，保留路径占位（内容不内联）
    let path = val.slice(1);
    const semi = path.indexOf(";");
    if (semi >= 0) path = path.slice(0, semi);
    return { key, kind: "file", value: "", fileName: path, enabled: true };
  }
  return { key, kind: "text", value: val, enabled: true };
}

/** 把 `a=1&b=2` 拆为 KV 行（值做 URL 解码，与 ① 的 urlToParams 一致）。 */
function parseFormPairs(s: string): KV[] {
  return s
    .split("&")
    .filter(Boolean)
    .map((pair) => {
      const i = pair.indexOf("=");
      const k = i >= 0 ? pair.slice(0, i) : pair;
      const v = i >= 0 ? pair.slice(i + 1) : "";
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

function findHeaderCI(headers: KV[], name: string): string | null {
  const lower = name.toLowerCase();
  const hit = headers.find((h) => h.key.toLowerCase() === lower);
  return hit ? hit.value.toLowerCase() : null;
}

function looksLikeJson(s: string): boolean {
  const t = s.trim();
  return t.startsWith("{") || t.startsWith("[");
}

function appendQueryToUrl(url: string, pairs: KV[]): string {
  const enabled = pairs.filter((p) => p.key);
  if (enabled.length === 0) return url;
  const qs = enabled
    .map((p) => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`)
    .join("&");
  return url + (url.includes("?") ? "&" : "?") + qs;
}

function dedupe(arr: string[]): string[] {
  return [...new Set(arr)];
}
