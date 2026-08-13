"use client";

import type { WireEnvelope } from "./types";

interface Props {
  wire: WireEnvelope;
  missing: string[];
  onClose: () => void;
}

/** 变量替换后的实际请求预览（所见即所发）。 */
export function PreviewDialog({ wire, missing, onClose }: Props) {
  const headers = Object.entries(wire.headers);
  return (
    <div className="apic-modal-mask" onClick={onClose}>
      <div className="apic-modal apic-preview" onClick={(e) => e.stopPropagation()}>
        <div className="apic-modal-title">替换后预览</div>

        {missing.length > 0 && (
          <div className="apic-preview-warn">
            ⚠ 未定义变量：{missing.map((m) => `{{${m}}}`).join("、")}（将原样发送）
          </div>
        )}

        <div className="apic-preview-body">
          <div className="apic-preview-line">
            <b>{wire.method}</b> {wire.url || "（空地址）"}
          </div>

          <div className="apic-preview-sec">Headers</div>
          {headers.length === 0 ? (
            <div className="apic-resp-empty">（无）</div>
          ) : (
            <div className="apic-kv-view">
              {headers.map(([k, v]) => (
                <div className="apic-kv-viewrow" key={k}>
                  <span className="apic-kv-vk">{k}</span>
                  <span className="apic-kv-vv">{v}</span>
                </div>
              ))}
            </div>
          )}

          <div className="apic-preview-sec">Body</div>
          <pre className="apic-resp-text">{previewBody(wire)}</pre>
        </div>

        <div className="apic-modal-actions">
          <button className="apic-btn-primary" onClick={onClose}>
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}

function previewBody(wire: WireEnvelope): string {
  const b = wire.body;
  if (b.kind === "none") return "（无 body）";
  if (b.kind === "raw") return b.text || "（空）";
  if (b.kind === "urlencoded")
    return b.pairs.map(([k, v]) => `${k}=${v}`).join("\n") || "（空）";
  return (
    b.fields
      .map((f) =>
        f.kind === "file" ? `${f.key}: [文件] ${f.fileName ?? ""}` : `${f.key}: ${f.value ?? ""}`
      )
      .join("\n") || "（空）"
  );
}
