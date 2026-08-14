"use client";

import { useState } from "react";
import { HashPanel } from "@/components/crypto/HashPanel";
import { HmacPanel } from "@/components/crypto/HmacPanel";
import { SymmetricPanel } from "@/components/crypto/SymmetricPanel";
import { AsymmetricPanel } from "@/components/crypto/AsymmetricPanel";
import { KdfPanel } from "@/components/crypto/KdfPanel";

/** 面板注册表：新增算法面板只需在此追加一条并提供组件。 */
const TABS = [
  { key: "hash", label: "哈希", Comp: HashPanel },
  { key: "hmac", label: "HMAC", Comp: HmacPanel },
  { key: "symmetric", label: "对称加解密", Comp: SymmetricPanel },
  { key: "asymmetric", label: "非对称", Comp: AsymmetricPanel },
  { key: "kdf", label: "密钥派生", Comp: KdfPanel },
] as const;

/**
 * 加解密工具。
 *
 * 单页多标签容器。与「编码转换」不同，本工具的计算走服务端 node:crypto——
 * 浏览器 Web Crypto 不支持 MD5、AES-ECB 等对接遗留系统必需的算法。
 * 所有面板同时挂载、用 CSS 控制显隐，以保证切换标签时各自的输入不丢失。
 */
export default function CryptoPage() {
  const [active, setActive] = useState<(typeof TABS)[number]["key"]>("hash");

  return (
    <div className="crypto-page">
      <div className="crypto-header">
        <h1 className="crypto-title">加解密</h1>
        <p className="crypto-desc">
          哈希 / HMAC / 对称 / 非对称 / 密钥派生 · 计算由本地服务端执行，输入仅用于当次计算，不保存、不记录。
        </p>
      </div>

      <div className="crypto-tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`crypto-tab${active === t.key ? " active" : ""}`}
            onClick={() => setActive(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="crypto-body">
        {TABS.map((t) => (
          <div key={t.key} hidden={active !== t.key}>
            <t.Comp />
          </div>
        ))}
      </div>
    </div>
  );
}
