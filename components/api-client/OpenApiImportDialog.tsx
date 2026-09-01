"use client";

import { useState } from "react";
import {
  DocParseError,
  ISSUE_TITLES,
  MAX_DOC_LABEL,
  parseToPlan,
  resolvePlanNames,
  type ImportIssue,
  type ImportIssueType,
  type ImportPlan,
  type NameResolution,
} from "@/lib/api-client/openapi";
import type { ApiEnvironment, ApiNode } from "./types";
import { importCollectionApi, type ImportResult } from "./api";

/**
 * OpenAPI / Swagger 导入弹窗（api-openapi-import ④b）。
 *
 * 三步：粘贴解析 → 预览确认 → 导入报告。产出的是集合树而非单个 tab，
 * 故与 cURL 导入并列而不复用其路径。只接受粘贴文本，**不提供 URL 拉取**——
 * 那等于开一个由用户控制目标地址的服务端出网请求（SSRF 形状），不值得为便利开。
 */

interface Props {
  /** 既有集合与环境，用于预览阶段预判重名。 */
  nodes: ApiNode[];
  environments: ApiEnvironment[];
  /** 导入成功后刷新集合树与环境列表。 */
  onImported: () => void;
  onClose: () => void;
}

type Step = "input" | "preview" | "done";

const PLACEHOLDER = `粘贴 OpenAPI / Swagger 文档原文（JSON 或 YAML），例如：
{
  "openapi": "3.0.1",
  "info": { "title": "订单服务" },
  "servers": [{ "url": "https://api.example.com", "description": "测试环境" }],
  "paths": { "/orders": { "get": { "tags": ["订单"], "summary": "订单列表" } } }
}`;

/** 降级项按类型分组，保持 ISSUE_TITLES 的声明顺序。 */
function groupIssues(issues: ImportIssue[]): Array<[ImportIssueType, ImportIssue[]]> {
  const map = new Map<ImportIssueType, ImportIssue[]>();
  for (const i of issues) {
    const list = map.get(i.type);
    if (list) list.push(i);
    else map.set(i.type, [i]);
  }
  return (Object.keys(ISSUE_TITLES) as ImportIssueType[])
    .filter((t) => map.has(t))
    .map((t) => [t, map.get(t)!]);
}

export function OpenApiImportDialog({ nodes, environments, onImported, onClose }: Props) {
  const [step, setStep] = useState<Step>("input");
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [names, setNames] = useState<NameResolution | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  const doParse = () => {
    setError(null);
    try {
      const { plan: p } = parseToPlan(text);
      setPlan(p);
      setNames(
        resolvePlanNames(p, {
          rootFolderNames: nodes.filter((n) => n.parentId === null).map((n) => n.name),
          envNames: environments.map((e) => e.name),
        })
      );
      setStep("preview");
    } catch (e) {
      // 三类失败各有可读文案：超出上限 / YAML 语法错误 / 不是 OpenAPI 文档
      setError(e instanceof DocParseError ? e.message : "解析失败：无法处理该文档");
    }
  };

  const doImport = async () => {
    if (!plan) return;
    setBusy(true);
    setError(null);
    const res = await importCollectionApi({
      rootName: plan.rootName,
      groups: plan.groups,
      environments: plan.environments,
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setResult(res.result);
    setStep("done");
    onImported();
  };

  /** 导入报告 = 解析期的降级项 + 写入时实际发生的重命名。 */
  const reportIssues: ImportIssue[] = (() => {
    if (!plan || !result) return [];
    const renamed = result.environments
      .filter((e) => e.renamedFrom)
      .map<ImportIssue>((e) => ({
        type: "env-renamed",
        where: e.renamedFrom!,
        message: `已存在同名环境，本次以「${e.name}」创建，既有环境未被改动`,
      }));
    return [...plan.issues, ...renamed];
  })();

  return (
    <div className="apic-modal-mask" onClick={onClose}>
      <div className="apic-modal apic-oai" onClick={(e) => e.stopPropagation()}>
        <div className="apic-modal-title">导入 OpenAPI / Swagger</div>

        {step === "input" && (
          <>
            <textarea
              className="apic-import-input"
              value={text}
              placeholder={PLACEHOLDER}
              onChange={(e) => setText(e.target.value)}
              autoFocus
              spellCheck={false}
            />
            <div className="apic-oai-hint">
              仅接受粘贴文本（JSON 或 YAML），上限 {MAX_DOC_LABEL}；不支持按地址拉取文档。
            </div>
          </>
        )}

        {step === "preview" && plan && names && (
          <div className="apic-oai-body">
            <div className="apic-oai-stats">
              将创建 <b>{plan.stats.folders}</b> 个文件夹、<b>{plan.stats.requests}</b> 个请求
            </div>
            <div className="apic-oai-line">
              根文件夹：<b>{names.rootName}</b>
            </div>
            {names.rootIsCopy && (
              <div className="apic-import-msg apic-oai-warn">
                已存在同名集合「{plan.rootName}」，将新建副本而非合并；既有集合不受影响。
              </div>
            )}
            {names.environments.length > 0 ? (
              <>
                <div className="apic-preview-sec">环境</div>
                {names.environments.map((e) => (
                  <div className="apic-oai-line" key={e.name}>
                    {e.name}
                    {e.renamedFrom && <span className="apic-oai-muted">（原名 {e.renamedFrom} 已被占用）</span>}
                    <span className="apic-oai-muted"> · baseUrl = {e.baseUrl}</span>
                  </div>
                ))}
              </>
            ) : (
              <div className="apic-oai-line apic-oai-muted">
                文档未定义服务器地址，不创建环境；请求 URL 仍以 {"{{baseUrl}}"} 为前缀。
              </div>
            )}
            <div className="apic-preview-sec">分组</div>
            <div className="apic-oai-groups">
              {plan.groups.map((g) => (
                <div className="apic-oai-line" key={g.name}>
                  {g.name} <span className="apic-oai-muted">· {g.requests.length} 个请求</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {step === "done" && result && (
          <div className="apic-oai-body">
            <div className="apic-import-msg apic-import-ok">
              ✓ 已导入「{result.rootName}」：{result.folders} 个文件夹、{result.requests} 个请求、
              {result.environments.length} 个环境。
            </div>
            {reportIssues.length > 0 && (
              <>
                <div className="apic-preview-sec">导入报告（{reportIssues.length} 项降级）</div>
                {groupIssues(reportIssues).map(([type, list]) => (
                  <div className="apic-oai-issue" key={type}>
                    <div className="apic-oai-issue-title">{ISSUE_TITLES[type]}</div>
                    {list.map((i, idx) => (
                      <div className="apic-oai-line" key={idx}>
                        <span className="apic-oai-muted">{i.where && `${i.where} — `}</span>
                        {i.message}
                      </div>
                    ))}
                  </div>
                ))}
              </>
            )}
          </div>
        )}

        {error && <div className="apic-import-msg apic-import-err">⚠ {error}</div>}

        <div className="apic-modal-actions">
          {step === "input" && (
            <>
              <button className="apic-btn-ghost" onClick={onClose}>
                取消
              </button>
              <button className="apic-btn-primary" onClick={doParse} disabled={!text.trim()}>
                解析
              </button>
            </>
          )}
          {step === "preview" && (
            <>
              <button className="apic-btn-ghost" onClick={onClose} disabled={busy}>
                取消
              </button>
              <button className="apic-btn-ghost" onClick={() => setStep("input")} disabled={busy}>
                返回
              </button>
              <button className="apic-btn-primary" onClick={doImport} disabled={busy}>
                {busy ? "导入中…" : "确认导入"}
              </button>
            </>
          )}
          {step === "done" && (
            <button className="apic-btn-primary" onClick={onClose}>
              完成
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
