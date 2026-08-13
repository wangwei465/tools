"use client";

import { useState } from "react";

type TsMode = "13" | "10";

/**
 * 生成签名工具。
 *
 * 规则：md5(时间戳 + appId + appSecret) 转小写。
 * 时间戳支持 13 位(毫秒) / 10 位(秒)，点击按钮生成当前时间戳，也可手动输入。
 * MD5 由服务端 /api/signature 用 Node crypto 计算（浏览器 Web Crypto 不支持 MD5）。
 */
export default function SignaturePage() {
  const [tsMode, setTsMode] = useState<TsMode>("13");
  const [timestamp, setTimestamp] = useState("");
  const [appId, setAppId] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [signature, setSignature] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  // 待签名原文：拼接顺序即签名规则，实时展示以消除歧义
  const raw = `${timestamp}${appId}${appSecret}`;

  // 按当前位数生成时间戳：13 位取毫秒，10 位取秒
  const genTimestamp = () => {
    const now = Date.now();
    setTimestamp(tsMode === "13" ? String(now) : String(Math.floor(now / 1000)));
  };

  const handleGenerate = async () => {
    if (!timestamp.trim() || !appId.trim() || !appSecret.trim()) {
      setError("时间戳、appId、appSecret 均不能为空");
      setSignature("");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/signature", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          timestamp: timestamp.trim(),
          appId: appId.trim(),
          appSecret: appSecret.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error ?? "生成失败");
        setSignature("");
        return;
      }
      setSignature(data.signature);
    } catch {
      setError("生成失败，请重试");
      setSignature("");
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!signature) return;
    try {
      await navigator.clipboard.writeText(signature);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // 剪贴板不可用时静默忽略
    }
  };

  return (
    <div className="sign-page">
      <div className="sign-header">
        <h1 className="sign-title">生成签名</h1>
        <p className="sign-desc">
          签名规则：<code>md5(时间戳 + appId + appSecret)</code> 转小写。
        </p>
      </div>

      <div className="sign-card">
        {/* 时间戳：位数切换 + 输入 + 生成 */}
        <div className="sign-field">
          <label>时间戳</label>
          <div className="sign-ts-row">
            <div className="sign-ts-tabs">
              <button
                className={`sign-ts-tab${tsMode === "13" ? " active" : ""}`}
                onClick={() => setTsMode("13")}
              >
                13 位(毫秒)
              </button>
              <button
                className={`sign-ts-tab${tsMode === "10" ? " active" : ""}`}
                onClick={() => setTsMode("10")}
              >
                10 位(秒)
              </button>
            </div>
            <input
              className="sign-input"
              value={timestamp}
              placeholder="点击右侧按钮生成，或手动输入"
              onChange={(e) => setTimestamp(e.target.value)}
            />
            <button className="sign-gen-ts" onClick={genTimestamp}>
              生成时间戳
            </button>
          </div>
        </div>

        {/* appId */}
        <div className="sign-field">
          <label>appId</label>
          <input
            className="sign-input"
            value={appId}
            placeholder="请输入 appId"
            onChange={(e) => setAppId(e.target.value)}
          />
        </div>

        {/* appSecret */}
        <div className="sign-field">
          <label>appSecret</label>
          <input
            className="sign-input"
            value={appSecret}
            placeholder="请输入 appSecret"
            onChange={(e) => setAppSecret(e.target.value)}
          />
        </div>

        {/* 待签名原文预览 */}
        <div className="sign-field">
          <label>待签名字符串（时间戳 + appId + appSecret）</label>
          <div className={`sign-raw${raw ? "" : " sign-raw-empty"}`}>
            {raw || "填写上方字段后在此预览"}
          </div>
        </div>

        <button className="sign-generate" onClick={handleGenerate} disabled={loading}>
          {loading ? "生成中…" : "生成签名"}
        </button>

        {error && <div className="sign-error">{error}</div>}

        {signature && (
          <div className="sign-result">
            <span className="sign-result-label">签名结果（MD5 小写）</span>
            <div className="sign-result-row">
              <span className="sign-result-value">{signature}</span>
              <button className="sign-copy" onClick={handleCopy}>
                {copied ? "已复制" : "复制"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
