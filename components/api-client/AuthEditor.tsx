"use client";

import type { AuthState, AuthType } from "./types";

const AUTH_TYPES: { key: AuthType; label: string }[] = [
  { key: "none", label: "无" },
  { key: "bearer", label: "Bearer Token" },
  { key: "basic", label: "Basic Auth" },
  { key: "apikey", label: "API Key" },
];

interface Props {
  auth: AuthState;
  onChange: (patch: Partial<AuthState>) => void;
}

/** 认证编辑区：none / bearer / basic / apikey（apikey 可选注入 header 或 query）。 */
export function AuthEditor({ auth, onChange }: Props) {
  return (
    <div className="apic-auth">
      <div className="apic-field">
        <label>认证方式</label>
        <select
          value={auth.type}
          onChange={(e) => onChange({ type: e.target.value as AuthType })}
        >
          {AUTH_TYPES.map((t) => (
            <option key={t.key} value={t.key}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      {auth.type === "bearer" && (
        <div className="apic-field">
          <label>Token</label>
          <input
            value={auth.bearerToken}
            placeholder="令牌值"
            onChange={(e) => onChange({ bearerToken: e.target.value })}
          />
        </div>
      )}

      {auth.type === "basic" && (
        <>
          <div className="apic-field">
            <label>用户名</label>
            <input
              value={auth.basicUser}
              onChange={(e) => onChange({ basicUser: e.target.value })}
            />
          </div>
          <div className="apic-field">
            <label>密码</label>
            <input
              type="password"
              value={auth.basicPassword}
              onChange={(e) => onChange({ basicPassword: e.target.value })}
            />
          </div>
        </>
      )}

      {auth.type === "apikey" && (
        <>
          <div className="apic-field">
            <label>Key</label>
            <input
              value={auth.apiKeyName}
              placeholder="如 X-API-Key"
              onChange={(e) => onChange({ apiKeyName: e.target.value })}
            />
          </div>
          <div className="apic-field">
            <label>Value</label>
            <input
              value={auth.apiKeyValue}
              onChange={(e) => onChange({ apiKeyValue: e.target.value })}
            />
          </div>
          <div className="apic-field">
            <label>注入位置</label>
            <select
              value={auth.apiKeyIn}
              onChange={(e) => onChange({ apiKeyIn: e.target.value as "header" | "query" })}
            >
              <option value="header">Header</option>
              <option value="query">Query 参数</option>
            </select>
          </div>
        </>
      )}
    </div>
  );
}
