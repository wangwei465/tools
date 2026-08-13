"use client";

import { useEffect, useState } from "react";

interface TokenConfig {
  headerName: string;
  prefix: string;
  token: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
}

const DEFAULT_CFG: TokenConfig = {
  headerName: "Authorization",
  prefix: "Bearer",
  token: "",
};

/** 默认超时（分钟），与后端 DEFAULT_TIMEOUT_MS（30 分钟）对应。 */
const DEFAULT_TIMEOUT_MIN = "30";

/** 毫秒 → 分钟字符串（用于输入框回显），去除浮点误差。 */
function msToMinuteText(ms: number): string {
  return String(Number((ms / 60000).toFixed(4)));
}

/**
 * 统一请求设置弹窗：令牌 + 请求超时。
 *
 * 打开时并行读取 /api/settings/token 与 /api/settings/timeout 回显，
 * 保存后写回 SQLite。两项配置均由后端代理在请求时读取，修改后无需重启。
 */
export function TokenSettings({ open, onClose }: Props) {
  const [cfg, setCfg] = useState<TokenConfig>(DEFAULT_CFG);
  const [timeoutMin, setTimeoutMin] = useState<string>(DEFAULT_TIMEOUT_MIN);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // 每次打开时并行拉取最新配置回显
  useEffect(() => {
    if (!open) return;
    setMsg(null);
    setLoading(true);
    Promise.all([
      fetch("/api/settings/token").then((r) => r.json()),
      fetch("/api/settings/timeout").then((r) => r.json()),
    ])
      .then(
        ([tokenData, timeoutData]: [Partial<TokenConfig>, { timeoutMs?: number }]) => {
          if (tokenData && typeof tokenData.headerName === "string") {
            setCfg({
              headerName: tokenData.headerName,
              prefix: tokenData.prefix ?? "",
              token: tokenData.token ?? "",
            });
          }
          if (timeoutData && typeof timeoutData.timeoutMs === "number") {
            setTimeoutMin(msToMinuteText(timeoutData.timeoutMs));
          }
        }
      )
      .catch(() => setMsg("读取配置失败"))
      .finally(() => setLoading(false));
  }, [open]);

  const handleSave = async () => {
    // 前端校验超时：必须是正数（分钟）
    const minutes = Number(timeoutMin);
    if (!Number.isFinite(minutes) || minutes <= 0) {
      setMsg("超时时间必须是正数（分钟）");
      return;
    }

    setSaving(true);
    setMsg(null);
    try {
      const [tokenRes, timeoutRes] = await Promise.all([
        fetch("/api/settings/token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(cfg),
        }),
        fetch("/api/settings/timeout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ timeoutMs: Math.round(minutes * 60000) }),
        }),
      ]);
      const [tokenData, timeoutData] = await Promise.all([
        tokenRes.json(),
        timeoutRes.json(),
      ]);

      if (!tokenRes.ok || tokenData?.ok === false) {
        setMsg(tokenData?.error ?? "保存失败");
        return;
      }
      if (!timeoutRes.ok || timeoutData?.ok === false) {
        setMsg(timeoutData?.error ?? "保存失败");
        return;
      }
      setMsg("已保存");
      setTimeout(onClose, 600);
    } catch {
      setMsg("保存失败");
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="token-overlay" onClick={onClose}>
      <div
        className="token-dialog"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="统一请求设置"
      >
        <div className="token-dialog-header">
          <span className="token-dialog-title">统一请求设置</span>
          <button className="token-close" onClick={onClose} aria-label="关闭">
            ✕
          </button>
        </div>

        <p className="token-hint">
          所有接口请求默认携带此令牌，格式为 <code>&lt;Header 名&gt;: &lt;Prefix&gt; &lt;Token&gt;</code>。
          令牌仅在服务端注入，不会写入历史记录。
        </p>

        <div className="token-field">
          <label>Header 名</label>
          <input
            value={cfg.headerName}
            disabled={loading}
            placeholder="Authorization"
            onChange={(e) => setCfg({ ...cfg, headerName: e.target.value })}
          />
        </div>
        <div className="token-field">
          <label>Prefix</label>
          <input
            value={cfg.prefix}
            disabled={loading}
            placeholder="Bearer（可留空）"
            onChange={(e) => setCfg({ ...cfg, prefix: e.target.value })}
          />
        </div>
        <div className="token-field">
          <label>Token</label>
          <input
            type="password"
            value={cfg.token}
            disabled={loading}
            placeholder="粘贴令牌值"
            onChange={(e) => setCfg({ ...cfg, token: e.target.value })}
          />
        </div>

        <div className="token-field">
          <label>
            请求超时
            <span className="save-name-hint">
              （分钟，支持小数，如 0.5 表示 30 秒；修改后立即生效）
            </span>
          </label>
          <input
            type="number"
            min="0"
            step="0.5"
            value={timeoutMin}
            disabled={loading}
            placeholder="30"
            onChange={(e) => setTimeoutMin(e.target.value)}
          />
        </div>

        <div className="token-dialog-footer">
          {msg && <span className="token-msg">{msg}</span>}
          <button className="btn-tool" onClick={onClose} disabled={saving}>
            取消
          </button>
          <button className="token-save" onClick={handleSave} disabled={loading || saving}>
            {saving ? "保存中…" : "保存"}
          </button>
        </div>
      </div>
    </div>
  );
}
