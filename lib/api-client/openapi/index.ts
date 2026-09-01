import { DocParseError, parseDocument, type OpenApiVersion } from "./detect";
import { checkOperationCount } from "./limits";
import { readV2 } from "./read-v2";
import { readV3 } from "./read-v3";
import { buildImportPlan, type ImportPlan } from "./to-nodes";
import type { ApiDocModel } from "./types";

/**
 * OpenAPI 导入解析层的统一入口（api-openapi-import ④b）。
 *
 * 一次调用完成「文本 → 版本判定 → 读取归一化 → 导入计划」，
 * 让 UI 与 API 路由都不必关心内部分层与版本分派。
 */

export { DocParseError, parseDocument, detectVersion } from "./detect";
export type { OpenApiVersion, ParseFailKind } from "./detect";
export { MAX_DOC_LABEL, MAX_OPERATIONS, checkOperationCount } from "./limits";
export { buildImportPlan, resolvePlanNames, uniqueName, BASE_URL_VAR } from "./to-nodes";
export type {
  ImportPlan,
  ImportPayload,
  ImportGroupSpec,
  ImportRequestSpec,
  ImportEnvSpec,
  NameResolution,
} from "./to-nodes";
export { ISSUE_TITLES } from "./types";
export type { ApiDocModel, ImportIssue, ImportIssueType } from "./types";

export interface ParseResult {
  version: OpenApiVersion;
  model: ApiDocModel;
  plan: ImportPlan;
}

/**
 * 解析粘贴的文档原文并产出导入计划。
 * 失败抛 `DocParseError`（kind 区分超出上限 / YAML 语法错误 / 非 OpenAPI 文档）。
 */
export function parseToPlan(text: string): ParseResult {
  const { version, doc } = parseDocument(text);
  const model = version === "2.0" ? readV2(doc) : readV3(doc);

  const overLimit = checkOperationCount(model.operations.length);
  if (overLimit) throw new DocParseError("limit", overLimit);

  return { version, model, plan: buildImportPlan(model) };
}
