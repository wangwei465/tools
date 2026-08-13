"use client";

import { useState } from "react";
import type { ApiEnvironment, ApiVariable } from "./types";

interface Props {
  environments: ApiEnvironment[];
  variables: ApiVariable[];
  onClose: () => void;
  onCreateEnv: (name: string) => void;
  onRenameEnv: (id: number, name: string) => void;
  onDeleteEnv: (id: number) => void;
  onCreateVar: (envId: number | null, key: string, value: string) => void;
  onUpdateVar: (id: number, patch: { key?: string; value?: string; enabled?: boolean }) => void;
  onDeleteVar: (id: number) => void;
}

/**
 * 环境与变量管理弹窗：左侧作用域列表（全局 + 各环境，可增删改名），
 * 右侧该作用域变量表（key/value/enabled，可整表掩码显示）。
 */
export function EnvManager(p: Props) {
  const [scope, setScope] = useState<number | null>(null); // null = 全局
  const [masked, setMasked] = useState(false);
  const scopeVars = p.variables.filter((v) => v.envId === scope);
  const scopeName = scope === null ? "全局变量" : p.environments.find((e) => e.id === scope)?.name ?? "";

  return (
    <div className="apic-modal-mask" onClick={p.onClose}>
      <div className="apic-modal apic-envmgr" onClick={(e) => e.stopPropagation()}>
        <div className="apic-modal-title">环境与变量</div>

        <div className="apic-envmgr-body">
          <div className="apic-envmgr-list">
            <div
              className={`apic-envmgr-item${scope === null ? " active" : ""}`}
              onClick={() => setScope(null)}
            >
              🌐 全局变量
            </div>
            {p.environments.map((e) => (
              <div
                key={e.id}
                className={`apic-envmgr-item${scope === e.id ? " active" : ""}`}
                onClick={() => setScope(e.id)}
              >
                <span className="apic-envmgr-name">
                  {e.name}
                  {e.isActive && <span className="apic-saved-hint"> ·激活</span>}
                </span>
                <span className="apic-tree-actions">
                  <button
                    title="重命名"
                    onClick={(ev) => {
                      ev.stopPropagation();
                      const n = window.prompt("环境名称", e.name);
                      if (n && n.trim()) p.onRenameEnv(e.id, n.trim());
                    }}
                  >
                    ✎
                  </button>
                  <button
                    title="删除"
                    onClick={(ev) => {
                      ev.stopPropagation();
                      if (window.confirm(`删除环境「${e.name}」及其变量？`)) p.onDeleteEnv(e.id);
                    }}
                  >
                    🗑
                  </button>
                </span>
              </div>
            ))}
            <button
              className="apic-kv-add"
              onClick={() => {
                const n = window.prompt("新建环境名称");
                if (n && n.trim()) p.onCreateEnv(n.trim());
              }}
            >
              + 新建环境
            </button>
          </div>

          <div className="apic-envmgr-vars">
            <div className="apic-envmgr-varhead">
              <span>{scopeName} 的变量</span>
              <button className="apic-btn-ghost" onClick={() => setMasked((m) => !m)}>
                {masked ? "显示值" : "隐藏值"}
              </button>
            </div>
            <div className="apic-kv">
              {scopeVars.map((v) => (
                <div key={v.id} className="apic-kv-row">
                  <input
                    type="checkbox"
                    checked={v.enabled}
                    onChange={(e) => p.onUpdateVar(v.id, { enabled: e.target.checked })}
                  />
                  <input
                    className="apic-kv-key"
                    defaultValue={v.key}
                    placeholder="变量名"
                    onBlur={(e) => {
                      if (e.target.value !== v.key) p.onUpdateVar(v.id, { key: e.target.value });
                    }}
                  />
                  <input
                    className="apic-kv-val"
                    type={masked ? "password" : "text"}
                    defaultValue={v.value}
                    placeholder="值"
                    onBlur={(e) => {
                      if (e.target.value !== v.value) p.onUpdateVar(v.id, { value: e.target.value });
                    }}
                  />
                  <button className="apic-kv-del" onClick={() => p.onDeleteVar(v.id)}>
                    ✕
                  </button>
                </div>
              ))}
              <button className="apic-kv-add" onClick={() => p.onCreateVar(scope, "", "")}>
                + 添加变量
              </button>
            </div>
          </div>
        </div>

        <div className="apic-modal-actions">
          <button className="apic-btn-primary" onClick={p.onClose}>
            完成
          </button>
        </div>
      </div>
    </div>
  );
}
