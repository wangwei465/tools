/**
 * OpenAPI 导入的各项上限（api-openapi-import ④b）。
 *
 * 三道闸门对应三类失控风险：超大文档拖死解析、深层/循环 schema 递归爆栈、
 * 异常文档一次生成上万节点。常量集中在此，解析层与 API 路由共用同一套阈值。
 */

/** 文档体积上限（字符数）。约 4 MB 纯 ASCII，足以覆盖大型服务的 swagger.json。 */
export const MAX_DOC_CHARS = 4 * 1024 * 1024;

/** schema 嵌套深度上限。超出即截断为占位，不再向下展开。 */
export const MAX_SCHEMA_DEPTH = 12;

/** 单次导入的操作数量上限。 */
export const MAX_OPERATIONS = 2000;

/** 体积上限的可读描述（用于提示文案）。 */
export const MAX_DOC_LABEL = `${MAX_DOC_CHARS / 1024 / 1024} MB`;

/** 校验文档体积；超限返回可读提示，合规返回 null。 */
export function checkDocSize(text: string): string | null {
  if (text.length <= MAX_DOC_CHARS) return null;
  return `文档过大（${(text.length / 1024 / 1024).toFixed(1)} MB），上限为 ${MAX_DOC_LABEL}，请改用更小的文档`;
}

/** 校验操作数量；超限返回可读提示，合规返回 null。 */
export function checkOperationCount(count: number): string | null {
  if (count <= MAX_OPERATIONS) return null;
  return `文档解析出 ${count} 个接口，超过单次导入上限 ${MAX_OPERATIONS} 个`;
}
