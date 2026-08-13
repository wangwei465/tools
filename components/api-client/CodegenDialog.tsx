"use client";

import { useState } from "react";
import type { WireEnvelope } from "./types";
import { CODE_TARGETS } from "./codegen";

interface Props {
  /** 组装后的 wire（③ 在场则为变量替换后值）——保证「所见即所发」。 */
  wire: WireEnvelope;
  onClose: () => void;
}

/** 代码生成面板：选择目标（curl / fetch / …）、展示、一键复制。 */
export function CodegenDialog({ wire, onClose }: Props) {
  const [targetId, setTargetId] = useState(CODE_TARGETS[0].id);
  const [copied, setCopied] = useState(false);

  const target = CODE_TARGETS.find((t) => t.id === targetId) ?? CODE_TARGETS[0];
  const code = target.generate(wire);

  const selectTarget = (id: string) => {
    setTargetId(id);
    setCopied(false);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="apic-modal-mask" onClick={onClose}>
      <div className="apic-modal apic-codegen" onClick={(e) => e.stopPropagation()}>
        <div className="apic-modal-title">生成代码</div>

        <div className="apic-codegen-targets">
          {CODE_TARGETS.map((t) => (
            <button
              key={t.id}
              className={t.id === targetId ? "active" : ""}
              onClick={() => selectTarget(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <pre className="apic-codegen-code">{code}</pre>

        <div className="apic-modal-actions">
          <button className="apic-btn-ghost" onClick={copy}>
            {copied ? "已复制 ✓" : "复制"}
          </button>
          <button className="apic-btn-primary" onClick={onClose}>
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}
