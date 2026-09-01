// js-yaml v5 为 ESM 具名导出、无 default 导出，须用命名空间导入
import * as yaml from "js-yaml";
import { isRecord } from "./types";
import { checkDocSize } from "./limits";

/**
 * 文档输入解析与版本判定（api-openapi-import ④b）。
 *
 * 输入按「先 JSON 后 YAML」两趟解析（YAML 是 JSON 的超集，反序不成立）；
 * 版本严格依 `swagger` / `openapi` 字段判定，两者皆缺失即报错，MUST NOT 猜测式解析。
 * 三类失败（超限 / 语法错 / 非文档）以 `kind` 区分，由 UI 给出可区分的提示。
 */

export type OpenApiVersion = "2.0" | "3.0" | "3.1";

/** 解析失败的原因分类：超出上限 / YAML 语法错误 / 不是 OpenAPI 文档。 */
export type ParseFailKind = "limit" | "syntax" | "not-openapi";

/** 文档解析失败——UI 捕获后按 kind 提示，不创建任何节点。 */
export class DocParseError extends Error {
  readonly kind: ParseFailKind;
  constructor(kind: ParseFailKind, message: string) {
    super(message);
    this.name = "DocParseError";
    this.kind = kind;
  }
}

export interface ParsedDoc {
  version: OpenApiVersion;
  doc: Record<string, unknown>;
}

/**
 * 依 `swagger: "2.0"` 与 `openapi: "3.x"` 判定版本。
 * 无法判定返回 null（调用方据此报「无法识别的文档格式」）。
 */
export function detectVersion(doc: unknown): OpenApiVersion | null {
  if (!isRecord(doc)) return null;

  const swagger = doc.swagger;
  if (typeof swagger === "string" && swagger.trim().startsWith("2.")) return "2.0";

  const openapi = doc.openapi;
  if (typeof openapi === "string") {
    const v = openapi.trim();
    if (v.startsWith("3.1")) return "3.1";
    if (v.startsWith("3.")) return "3.0";
  }
  return null;
}

/** 文本 → 对象：先按 JSON，失败再按 YAML。两者皆失败抛 syntax 错误。 */
function parseText(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    // 落到 YAML：JSON 语法错的文本多半也过不了 YAML，错误信息以 YAML 为准
  }
  try {
    return yaml.load(text);
  } catch (e) {
    const detail = e instanceof Error ? e.message.split("\n")[0] : String(e);
    throw new DocParseError("syntax", `YAML 语法错误：${detail}`);
  }
}

/**
 * 解析粘贴的文档原文（JSON 或 YAML）并判定版本。
 * 失败抛 `DocParseError`，其 kind 区分「超出体积上限 / YAML 语法错误 / 不是 OpenAPI 文档」。
 */
export function parseDocument(text: string): ParsedDoc {
  if (!text.trim()) {
    throw new DocParseError("not-openapi", "请粘贴 OpenAPI / Swagger 文档内容");
  }
  const oversize = checkDocSize(text);
  if (oversize) throw new DocParseError("limit", oversize);

  const parsed = parseText(text);
  if (!isRecord(parsed)) {
    throw new DocParseError("not-openapi", "内容不是一份 OpenAPI / Swagger 文档（顶层不是对象）");
  }

  const version = detectVersion(parsed);
  if (!version) {
    throw new DocParseError(
      "not-openapi",
      "无法识别的文档格式：既无 swagger 也无 openapi 版本字段"
    );
  }
  return { version, doc: parsed };
}
