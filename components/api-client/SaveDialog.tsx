"use client";

import { useState } from "react";
import type { TreeNode } from "./types";
import { folderOptions } from "./tree";

interface Props {
  tree: TreeNode[];
  defaultName: string;
  onConfirm: (parentId: number | null, name: string) => void;
  onCancel: () => void;
}

/** 保存到集合对话框：选择目标文件夹 + 命名。 */
export function SaveDialog({ tree, defaultName, onConfirm, onCancel }: Props) {
  const [name, setName] = useState(defaultName || "未命名请求");
  const [parentId, setParentId] = useState<number | null>(null);
  const options = folderOptions(tree);

  const confirm = () => {
    const n = name.trim();
    if (n) onConfirm(parentId, n);
  };

  return (
    // 遮罩不响应点击：仅「保存 / 取消」按钮或 Esc 可关闭，避免误点外部丢失输入
    <div className="apic-modal-mask">
      <div className="apic-modal">
        <div className="apic-modal-title">保存到集合</div>

        <div className="apic-field">
          <label>名称</label>
          <input
            value={name}
            autoFocus
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") confirm();
              if (e.key === "Escape") onCancel();
            }}
          />
        </div>

        <div className="apic-field">
          <label>位置</label>
          <select
            value={parentId ?? ""}
            onChange={(e) => setParentId(e.target.value === "" ? null : Number(e.target.value))}
          >
            {options.map((o) => (
              <option key={o.id ?? "root"} value={o.id ?? ""}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div className="apic-modal-actions">
          <button className="apic-btn-ghost" onClick={onCancel}>
            取消
          </button>
          <button className="apic-btn-primary" disabled={!name.trim()} onClick={confirm}>
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
