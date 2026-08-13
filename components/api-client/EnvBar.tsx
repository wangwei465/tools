"use client";

import type { ApiEnvironment } from "./types";

interface Props {
  environments: ApiEnvironment[];
  activeEnvId: number | null;
  onActivate: (id: number | null) => void;
  onOpenManager: () => void;
}

/** 顶部环境切换器：选择激活环境（含「无环境」）+ 打开环境/变量管理。 */
export function EnvBar({ environments, activeEnvId, onActivate, onOpenManager }: Props) {
  return (
    <div className="apic-envbar">
      <select
        className="apic-env-select"
        value={activeEnvId ?? ""}
        onChange={(e) => onActivate(e.target.value === "" ? null : Number(e.target.value))}
        title="激活环境"
      >
        <option value="">无环境</option>
        {environments.map((e) => (
          <option key={e.id} value={e.id}>
            {e.name}
          </option>
        ))}
      </select>
      <button className="apic-btn-ghost" onClick={onOpenManager} title="管理环境与变量">
        环境变量
      </button>
    </div>
  );
}
