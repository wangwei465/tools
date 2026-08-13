"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { json } from "@codemirror/lang-json";
import { foldAll, unfoldAll } from "@codemirror/language";
import type { EditorView } from "@codemirror/view";
import type { ResponseState } from "./types";
import { cmTheme } from "./cmTheme";
import { useFlash } from "./useFlash";

type RespTab = "body" | "headers" | "cookies";

/** 状态码配色分类。 */
function statusClass(status: number): string {
  if (status >= 200 && status < 300) return "s2";
  if (status >= 300 && status < 400) return "s3";
  if (status >= 400 && status < 500) return "s4";
  return "s5";
}

/** 是否为二进制类型（不做预览）。 */
function isBinary(ct: string): boolean {
  return /^(image|audio|video)\/|application\/(octet-stream|pdf|zip|gzip)/i.test(ct);
}

function prettyJson(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

/** 从合并的 Set-Cookie 头解析出 cookie 键值（第一版仅键值）。 */
function parseCookies(headers: Record<string, string>): Array<[string, string]> {
  const raw = headers["set-cookie"] ?? headers["Set-Cookie"];
  if (!raw) return [];
  return raw
    .split(/,(?=[^;,]+=)/) // 按 cookie 边界切分（下一段形如 name=）
    .map((c) => {
      const first = c.split(";")[0];
      const eq = first.indexOf("=");
      if (eq < 0) return ["", ""] as [string, string];
      return [first.slice(0, eq).trim(), first.slice(eq + 1).trim()] as [string, string];
    })
    .filter(([k]) => k);
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

interface Props {
  response: ResponseState | null;
  sending: boolean;
}

/** 响应面板：状态摘要 + Body（按 content-type 分流）/ Headers / Cookies。 */
export function ResponsePane({ response, sending }: Props) {
  const [tab, setTab] = useState<RespTab>("body");
  const [folded, setFolded] = useState(false);
  const [hint, flash] = useFlash();
  const viewRef = useRef<EditorView | null>(null);
  const extensions = useMemo(() => [cmTheme, json()], []);

  // 新响应到达 → 编辑器内容重建，折叠态失效需复位
  useEffect(() => setFolded(false), [response?.body]);

  if (sending) return <div className="apic-response apic-resp-empty">请求中…</div>;
  if (!response)
    return <div className="apic-response apic-resp-empty">发送请求后在此查看响应</div>;
  if (response.error)
    return <div className="apic-response apic-resp-error">✗ {response.error}</div>;

  const ct = response.contentType.toLowerCase();
  const isJson = ct.includes("json");
  const binary = isBinary(ct);
  const cookies = parseCookies(response.headers);
  const headerEntries = Object.entries(response.headers);
  const prettyBody = isJson ? prettyJson(response.body) : response.body;

  /** 复制展示中的内容（美化后文本），保证「所见即所复制」。 */
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(prettyBody);
      flash("已复制 ✓");
    } catch {
      flash("复制失败");
    }
  };

  /** 全部折叠 / 全部展开 JSON 层级。 */
  const toggleFold = () => {
    const view = viewRef.current;
    if (!view) return;
    if (folded) unfoldAll(view);
    else foldAll(view);
    setFolded(!folded);
  };

  return (
    <div className="apic-response">
      <div className="apic-resp-status">
        <span className={`apic-code ${statusClass(response.status)}`}>
          {response.status} {response.statusText}
        </span>
        <span className="apic-resp-meta">
          {response.timeMs} ms · {formatSize(response.size)}
        </span>
      </div>

      <div className="apic-subtabs">
        <button className={tab === "body" ? "active" : ""} onClick={() => setTab("body")}>
          Body
        </button>
        <button className={tab === "headers" ? "active" : ""} onClick={() => setTab("headers")}>
          Headers ({headerEntries.length})
        </button>
        <button className={tab === "cookies" ? "active" : ""} onClick={() => setTab("cookies")}>
          Cookies{cookies.length ? ` (${cookies.length})` : ""}
        </button>
      </div>

      <div className="apic-resp-pane">
        {tab === "body" &&
          (binary ? (
            <div className="apic-resp-empty">
              二进制响应（{response.contentType}），无法预览
            </div>
          ) : isJson ? (
            <div className="apic-resp-cm">
              <div className="apic-cm-bar">
                {hint && <span className="apic-cm-hint">{hint}</span>}
                <button className="apic-tool-btn" onClick={toggleFold} title="折叠 / 展开所有层级">
                  {folded ? "展开" : "折叠"}
                </button>
                <button className="apic-tool-btn" onClick={copy} title="复制响应 JSON">
                  复制
                </button>
              </div>
              <CodeMirror
                value={prettyBody}
                extensions={extensions}
                theme="dark"
                height="100%"
                editable={false}
                onCreateEditor={(view) => {
                  viewRef.current = view;
                }}
                basicSetup={{
                  lineNumbers: true,
                  foldGutter: true,
                  highlightActiveLine: false,
                  autocompletion: false,
                }}
              />
            </div>
          ) : (
            <pre className="apic-resp-text">{response.body || "（空响应体）"}</pre>
          ))}

        {tab === "headers" && (
          <div className="apic-kv-view">
            {headerEntries.map(([k, v]) => (
              <div className="apic-kv-viewrow" key={k}>
                <span className="apic-kv-vk">{k}</span>
                <span className="apic-kv-vv">{v}</span>
              </div>
            ))}
          </div>
        )}

        {tab === "cookies" &&
          (cookies.length ? (
            <div className="apic-kv-view">
              {cookies.map(([k, v]) => (
                <div className="apic-kv-viewrow" key={k}>
                  <span className="apic-kv-vk">{k}</span>
                  <span className="apic-kv-vv">{v}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="apic-resp-empty">无 Cookie</div>
          ))}
      </div>
    </div>
  );
}
