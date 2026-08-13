"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface HeaderRow {
  key: string;
  value: string;
}

interface HistoryItem {
  id: number;
  name: string;
  url: string;
  method: string;
  headers: Record<string, string>;
  useCount: number;
  lastUsedAt: string;
}

interface Props {
  side: "left" | "right";
  onFilled: (json: string) => void;
}

const LABEL = { left: "左侧接口", right: "右侧接口" };

export function RequestBar({ side, onFilled }: Props) {
  const [url, setUrl] = useState("");
  const [selectedName, setSelectedName] = useState(""); // 从历史选中后回显的名称
  const [headers, setHeaders] = useState<HeaderRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showHeaders, setShowHeaders] = useState(false);

  // 历史下拉
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  // 保存弹窗
  const [showSave, setShowSave] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveLoading, setSaveLoading] = useState(false);
  const [checking, setChecking] = useState(false);

  // 历史下拉：输入变化时防抖拉取
  useEffect(() => {
    if (!showDropdown) return;
    const t = setTimeout(() => {
      fetch(`/api/request-records?keyword=${encodeURIComponent(url)}`)
        .then((r) => r.json())
        .then((data: HistoryItem[]) => setHistory(Array.isArray(data) ? data : []))
        .catch(() => setHistory([]));
    }, 200);
    return () => clearTimeout(t);
  }, [url, showDropdown]);

  // 点击组件外部关闭下拉
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  // 实时校验名称唯一性（防抖 400ms）
  useEffect(() => {
    if (!showSave || !saveName.trim() || !url.trim()) {
      setSaveError(null);
      return;
    }
    setChecking(true);
    const t = setTimeout(() => {
      const params = new URLSearchParams({
        checkOnly: "1",
      });
      fetch(`/api/request-records?${params}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: saveName.trim(), url: url.trim(), method: "GET" }),
      })
        .then((r) => r.json())
        .then((data: { exists?: boolean }) => {
          setSaveError(data.exists ? `名称"${saveName.trim()}"已存在` : null);
        })
        .catch(() => setSaveError(null))
        .finally(() => setChecking(false));
    }, 400);
    return () => { clearTimeout(t); setChecking(false); };
  }, [saveName, url, showSave]);

  // 选中历史项回填：同时记录名称用于回显
  const pickHistory = useCallback((item: HistoryItem) => {
    setUrl(item.url);
    setSelectedName(item.name ?? "");
    const rows = Object.entries(item.headers ?? {}).map(([key, value]) => ({ key, value }));
    setHeaders(rows);
    if (rows.length) setShowHeaders(true);
    setShowDropdown(false);
    setError(null);
  }, []);

  // Header 编辑
  const updateHeader = (i: number, patch: Partial<HeaderRow>) =>
    setHeaders((prev) => prev.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  const addHeader = () => setHeaders((prev) => [...prev, { key: "", value: "" }]);
  const removeHeader = (i: number) => setHeaders((prev) => prev.filter((_, idx) => idx !== i));

  // 请求（只请求回填，不写历史）
  const handleFetch = useCallback(async () => {
    const target = url.trim();
    if (!target) { setError("请填写请求地址"); return; }
    setShowDropdown(false);
    setLoading(true);
    setError(null);

    const headerObj: Record<string, string> = {};
    for (const { key, value } of headers) {
      const k = key.trim();
      if (k) headerObj[k] = value;
    }

    try {
      const res = await fetch("/api/proxy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: target, headers: headerObj }),
      });
      const data = await res.json();
      if (!res.ok || data?.ok === false) { setError(data?.error ?? "请求失败"); return; }
      onFilled(JSON.stringify(data.body, null, 2));
    } catch {
      setError("请求失败，请检查网络或地址");
    } finally {
      setLoading(false);
    }
  }, [url, headers, onFilled]);

  // 打开保存弹窗
  const openSave = () => {
    if (!url.trim()) { setError("请先填写请求地址"); return; }
    setSaveName("");
    setSaveError(null);
    setShowSave(true);
  };

  // 确认保存
  const handleSaveConfirm = async () => {
    const name = saveName.trim();
    if (!name) { setSaveError("名称不能为空"); return; }
    if (saveError) return; // 名称重复，不提交

    setSaveLoading(true);
    const headerObj: Record<string, string> = {};
    for (const { key, value } of headers) {
      const k = key.trim();
      if (k) headerObj[k] = value;
    }

    try {
      const res = await fetch("/api/request-records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, url: url.trim(), method: "GET", headers: headerObj }),
      });
      const data = await res.json();
      if (!res.ok || data?.ok === false) {
        setSaveError(data?.error ?? "保存失败");
        return;
      }
      setShowSave(false);
    } catch {
      setSaveError("保存失败，请重试");
    } finally {
      setSaveLoading(false);
    }
  };

  const headerCount = headers.filter((h) => h.key.trim()).length;

  return (
    <div className="req-bar" ref={boxRef}>
      {/* 第一行：侧标签 + 已选名称（回显）+ Header + 请求 + 保存 */}
      <div className="req-row">
        <span className="req-side-label">{LABEL[side]}</span>
        {selectedName && (
          <span className="req-selected-name" title={selectedName}>
            {selectedName}
            <button
              className="req-selected-clear"
              onClick={() => { setSelectedName(""); setUrl(""); setHeaders([]); }}
              aria-label="清除选中"
            >✕</button>
          </span>
        )}
        <button
          className="req-header-toggle"
          onClick={() => setShowHeaders((v) => !v)}
          title="配置普通 Header"
        >
          Header{headerCount > 0 ? ` (${headerCount})` : ""}
        </button>
        <button className="req-send" onClick={handleFetch} disabled={loading}>
          {loading ? "请求中…" : "请求"}
        </button>
        <button className="req-save-btn" onClick={openSave} title="保存到历史记录">
          保存
        </button>
      </div>

      {/* 第二行：URL 输入 + 历史下拉 */}
      <div className="req-url-wrap">
        <input
          className="req-url"
          value={url}
          placeholder="请求地址（GET）"
          onChange={(e) => {
              setUrl(e.target.value);
              setSelectedName(""); // 手动编辑 URL 时清除回显名称
              setShowDropdown(true);
            }}
          onFocus={() => setShowDropdown(true)}
          onKeyDown={(e) => { if (e.key === "Enter") handleFetch(); }}
        />
        {showDropdown && history.length > 0 && (
          <ul className="req-dropdown">
            {history.map((item) => (
              <li key={item.id} onClick={() => pickHistory(item)}>
                {item.name ? (
                  <>
                    <span className="req-dd-name">{item.name}</span>
                    <span className="req-dd-url req-dd-url--sub">{item.url}</span>
                  </>
                ) : (
                  <span className="req-dd-url">{item.url}</span>
                )}
                <span className="req-dd-meta">
                  {Object.keys(item.headers ?? {}).length > 0 &&
                    `${Object.keys(item.headers).length} headers · `}
                  用过 {item.useCount} 次
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Header 编辑区 */}
      {showHeaders && (
        <div className="req-headers">
          {headers.map((row, i) => (
            <div className="req-header-row" key={i}>
              <input
                className="req-h-key"
                value={row.key}
                placeholder="Header 名"
                onChange={(e) => updateHeader(i, { key: e.target.value })}
              />
              <input
                className="req-h-val"
                value={row.value}
                placeholder="值"
                onChange={(e) => updateHeader(i, { value: e.target.value })}
              />
              <button className="req-h-del" onClick={() => removeHeader(i)} aria-label="删除">✕</button>
            </div>
          ))}
          <button className="req-h-add" onClick={addHeader}>+ 添加 Header</button>
        </div>
      )}

      {error && <div className="req-error">{error}</div>}

      {/* 保存弹窗 */}
      {showSave && (
        <div className="save-overlay">
          <div className="save-dialog">
            <div className="save-dialog-header">
              <span className="save-dialog-title">保存接口</span>
              <button className="token-close" onClick={() => setShowSave(false)}>✕</button>
            </div>

            <div className="save-url-preview">{url}</div>

            <div className="token-field">
              <label>
                名称
                <span className="save-name-hint">（支持中文，相同地址可用不同名称区分）</span>
              </label>
              <input
                autoFocus
                value={saveName}
                placeholder="例：机构详情-生产环境"
                onChange={(e) => setSaveName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleSaveConfirm(); }}
              />
              {checking && <span className="save-checking">检查中…</span>}
              {!checking && saveError && <span className="save-name-error">{saveError}</span>}
            </div>

            <div className="token-dialog-footer">
              <button className="save-cancel" onClick={() => setShowSave(false)} disabled={saveLoading}>
                取消
              </button>
              <button
                className="token-save"
                onClick={handleSaveConfirm}
                disabled={saveLoading || checking || !!saveError || !saveName.trim()}
              >
                {saveLoading ? "保存中…" : "保存"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
