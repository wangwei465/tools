"use client";

import { useState } from "react";
import { JsonYamlConverter } from "@/components/convert/JsonYamlConverter";
import { Base64Converter } from "@/components/convert/Base64Converter";
import { UrlConverter } from "@/components/convert/UrlConverter";
import { DateTimeConverter } from "@/components/convert/DateTimeConverter";
import { UuidConverter } from "@/components/convert/UuidConverter";
import { JwtConverter } from "@/components/convert/JwtConverter";
import { RegexConverter } from "@/components/convert/RegexConverter";

/** 转换器注册表：新增转换器只需在此追加一条并提供组件。 */
const TABS = [
  { key: "json-yaml", label: "JSON ⇔ YAML", Comp: JsonYamlConverter },
  { key: "base64", label: "Base64", Comp: Base64Converter },
  { key: "url", label: "URL", Comp: UrlConverter },
  { key: "datetime", label: "时间戳", Comp: DateTimeConverter },
  { key: "uuid", label: "UUID", Comp: UuidConverter },
  { key: "jwt", label: "JWT", Comp: JwtConverter },
  { key: "regex", label: "正则", Comp: RegexConverter },
] as const;

/**
 * 编码转换工具。
 *
 * 单页多标签容器：七个纯前端转换器，全部客户端计算、不落库、不发网络请求。
 * 切换标签仅换渲染的转换器，各转换器状态互不干扰。
 */
export default function ConvertPage() {
  const [active, setActive] = useState<(typeof TABS)[number]["key"]>("json-yaml");
  const ActiveComp = TABS.find((t) => t.key === active)!.Comp;

  return (
    <div className="conv-page">
      <div className="conv-header">
        <h1 className="conv-title">编码转换</h1>
        <p className="conv-desc">多合一开发者转换面板 · 纯本地计算，不上传任何数据。</p>
      </div>

      <div className="conv-tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`conv-tab${active === t.key ? " active" : ""}`}
            onClick={() => setActive(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="conv-body">
        <ActiveComp />
      </div>
    </div>
  );
}
