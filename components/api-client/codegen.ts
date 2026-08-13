import type { WireEnvelope } from "./types";

/**
 * 代码生成（api-code-generation ④a）——组装管线的「旁路终端」。
 *
 * 统一输入为 ① 组装后的 wire `{ method, url, headers, bodyType, body }`，
 * generator 只做 `wire → string` 序列化，保证「所见即所发」。
 *
 * 开闭原则（OCP）：新增目标只需实现 CodeTarget 并加入 CODE_TARGETS，
 * 不改动主逻辑与调用方。
 */

export interface CodeTarget {
  /** 稳定标识（用于选择状态）。 */
  id: string;
  /** 面板展示名。 */
  label: string;
  /** wire → 目标代码字符串。 */
  generate: (wire: WireEnvelope) => string;
}

/* ─── 4.2 curl generator ───────────────────────────────────── */

function generateCurl(wire: WireEnvelope): string {
  const parts: string[] = [`curl -X ${wire.method} ${shQuote(wire.url)}`];

  for (const [k, v] of Object.entries(wire.headers)) {
    parts.push(`-H ${shQuote(`${k}: ${v}`)}`);
  }

  const b = wire.body;
  if (b.kind === "raw") {
    parts.push(`-d ${shQuote(b.text)}`);
  } else if (b.kind === "urlencoded") {
    for (const [k, v] of b.pairs) {
      parts.push(`--data-urlencode ${shQuote(`${k}=${v}`)}`);
    }
  } else if (b.kind === "form-data") {
    for (const f of b.fields) {
      const spec =
        f.kind === "file" ? `${f.key}=@${f.fileName ?? ""}` : `${f.key}=${f.value ?? ""}`;
      parts.push(`-F ${shQuote(spec)}`);
    }
  }

  // 多行续行，便于阅读与复制
  return parts.join(" \\\n  ");
}

/** shell 单引号包裹：把内部 `'` 转义为 `'\''`，其余字面量安全。 */
function shQuote(s: string): string {
  return `'` + s.replace(/'/g, `'\\''`) + `'`;
}

/* ─── 4.3 fetch (JS) generator ─────────────────────────────── */

function generateFetch(wire: WireEnvelope): string {
  const headers = { ...wire.headers };
  const pre: string[] = [];
  let bodyLine = "";

  const b = wire.body;
  if (b.kind === "raw") {
    bodyLine = `  body: ${JSON.stringify(b.text)},\n`;
  } else if (b.kind === "urlencoded") {
    bodyLine = `  body: new URLSearchParams(${JSON.stringify(b.pairs)}),\n`;
  } else if (b.kind === "form-data") {
    // 交由浏览器设置 multipart boundary，去掉手写 Content-Type
    for (const k of Object.keys(headers)) {
      if (k.toLowerCase() === "content-type") delete headers[k];
    }
    pre.push("const form = new FormData();");
    for (const f of b.fields) {
      if (f.kind === "file") {
        pre.push(
          `form.append(${JSON.stringify(f.key)}, /* 文件占位: ${f.fileName ?? ""} */ new Blob());`
        );
      } else {
        pre.push(`form.append(${JSON.stringify(f.key)}, ${JSON.stringify(f.value ?? "")});`);
      }
    }
    bodyLine = `  body: form,\n`;
  }

  const headerEntries = Object.entries(headers);
  const headerBlock = headerEntries.length
    ? `  headers: {\n` +
      headerEntries.map(([k, v]) => `    ${JSON.stringify(k)}: ${JSON.stringify(v)},`).join("\n") +
      `\n  },\n`
    : "";

  const preBlock = pre.length ? pre.join("\n") + "\n\n" : "";

  return (
    preBlock +
    `const res = await fetch(${JSON.stringify(wire.url)}, {\n` +
    `  method: ${JSON.stringify(wire.method)},\n` +
    headerBlock +
    bodyLine +
    `});\n` +
    `const data = await res.json();`
  );
}

/* ─── 目标注册表（可扩展）───────────────────────────────────── */

export const CODE_TARGETS: CodeTarget[] = [
  { id: "curl", label: "cURL", generate: generateCurl },
  { id: "fetch", label: "fetch (JS)", generate: generateFetch },
];
