"use client";

import { useState } from "react";
import type { RequestDraft, KV, HttpMethod } from "./types";
import { HTTP_METHODS } from "./types";
import { paramsToUrl, urlToParams } from "./assemble";
import { KVTable } from "./KVTable";
import { BodyEditor } from "./BodyEditor";
import { AuthEditor } from "./AuthEditor";

type SubTab = "params" | "headers" | "body" | "auth";

interface Props {
  request: RequestDraft;
  sending: boolean;
  onPatch: (patch: Partial<RequestDraft>) => void;
  onSend: () => void;
  onCancel: () => void;
}

/** 请求面板：请求行（方法/URL/发送）+ 参数页签（Params/Headers/Body/Auth）。 */
export function RequestPane({ request, sending, onPatch, onSend, onCancel }: Props) {
  const [sub, setSub] = useState<SubTab>("params");

  // 改 params 表格 → 序列化写回 URL（URL 为真相源）
  const onParamsChange = (rows: KV[]) =>
    onPatch({ params: rows, url: paramsToUrl(request.url, rows) });
  // URL 失焦 → 解析 query 回填 params（断更新环）
  const onUrlBlur = () => onPatch({ params: urlToParams(request.url) });

  const paramCount = request.params.filter((p) => p.key.trim()).length;
  const headerCount = request.headers.filter((h) => h.key.trim()).length;

  return (
    <div className="apic-request">
      <div className="apic-reqline">
        <select
          className="apic-method"
          value={request.method}
          onChange={(e) => onPatch({ method: e.target.value as HttpMethod })}
        >
          {HTTP_METHODS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <input
          className="apic-url"
          value={request.url}
          placeholder="https://api.example.com/path"
          onChange={(e) => onPatch({ url: e.target.value })}
          onBlur={onUrlBlur}
          onKeyDown={(e) => {
            if (e.key === "Enter") onSend();
          }}
        />
        {sending ? (
          <button className="apic-cancel" onClick={onCancel}>
            取消
          </button>
        ) : (
          <button className="apic-send" onClick={onSend}>
            发送
          </button>
        )}
      </div>

      <div className="apic-subtabs">
        <button className={sub === "params" ? "active" : ""} onClick={() => setSub("params")}>
          Params{paramCount ? ` (${paramCount})` : ""}
        </button>
        <button className={sub === "headers" ? "active" : ""} onClick={() => setSub("headers")}>
          Headers{headerCount ? ` (${headerCount})` : ""}
        </button>
        <button className={sub === "body" ? "active" : ""} onClick={() => setSub("body")}>
          Body{request.body.type !== "none" ? " ●" : ""}
        </button>
        <button className={sub === "auth" ? "active" : ""} onClick={() => setSub("auth")}>
          Auth{request.auth.type !== "none" ? " ●" : ""}
        </button>
      </div>

      <div className="apic-subpane">
        {sub === "params" && (
          <KVTable
            rows={request.params}
            onChange={onParamsChange}
            keyPlaceholder="参数名"
            valuePlaceholder="参数值"
          />
        )}
        {sub === "headers" && (
          <KVTable
            rows={request.headers}
            onChange={(rows) => onPatch({ headers: rows })}
            keyPlaceholder="Header 名"
            valuePlaceholder="值"
          />
        )}
        {sub === "body" && (
          <BodyEditor
            body={request.body}
            onChange={(patch) => onPatch({ body: { ...request.body, ...patch } })}
          />
        )}
        {sub === "auth" && (
          <AuthEditor
            auth={request.auth}
            onChange={(patch) => onPatch({ auth: { ...request.auth, ...patch } })}
          />
        )}
      </div>
    </div>
  );
}
