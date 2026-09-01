import { isRecord, pushIssue, type ImportIssue } from "./types";
import { RefResolver } from "./ref";

/**
 * 由 OpenAPI Schema Object 生成示例值（api-openapi-import ④b）。
 *
 * 取值优先级：显式 `example` / `examples` > `default` > `enum` 首值 > 依 `type` + `format` 的占位。
 * 递归的循环与深度护栏全部交给 `RefResolver`，本模块只负责取值与结构展开。
 * 刻意不复用「文本工具」的类型推断：那是 JSON 样本 → 类型定义，方向与输入均相反。
 */

/** `type` + `format` → 占位字符串。 */
const STRING_PLACEHOLDERS: Record<string, string> = {
  "date-time": "2024-01-01T00:00:00Z",
  date: "2024-01-01",
  time: "00:00:00",
  uuid: "00000000-0000-0000-0000-000000000000",
  email: "user@example.com",
  hostname: "example.com",
  uri: "https://example.com",
  url: "https://example.com",
  ipv4: "127.0.0.1",
  ipv6: "::1",
  password: "password",
  byte: "",
  binary: "",
};

/** 从 `examples` 取首个示例值：数组取首项，对象取首个条目的 `value`。 */
function pickExamples(examples: unknown): unknown {
  if (Array.isArray(examples)) return examples.length > 0 ? examples[0] : undefined;
  if (isRecord(examples)) {
    for (const v of Object.values(examples)) {
      if (isRecord(v) && "value" in v) return v.value;
      return v;
    }
  }
  return undefined;
}

/** 归一化 `type`：3.1 允许数组形式（如 `["string","null"]`），缺失时据结构推断。 */
function normalizeType(schema: Record<string, unknown>): string {
  const t = schema.type;
  if (typeof t === "string") return t;
  if (Array.isArray(t)) {
    const first = t.find((x) => typeof x === "string" && x !== "null");
    return typeof first === "string" ? first : "null";
  }
  if (isRecord(schema.properties)) return "object";
  if (schema.items !== undefined) return "array";
  return "";
}

function buildObject(schema: Record<string, unknown>, r: RefResolver, where: string): unknown {
  const out: Record<string, unknown> = {};
  const props = schema.properties;
  if (isRecord(props)) {
    for (const [key, sub] of Object.entries(props)) {
      out[key] = r.enter(null, where, () => build(sub, r, where));
    }
  }
  return out;
}

function build(schema: unknown, r: RefResolver, where: string): unknown {
  if (!isRecord(schema)) return null;

  // $ref：解析后在引用栈保护下展开；降级时返回占位 null
  const ref = schema.$ref;
  if (typeof ref === "string") {
    const target = r.resolve(ref, where);
    if (target === null) return null;
    return r.enter(ref, where, () => build(target, r, where));
  }

  // 1. 显式示例 > 2. 默认值 > 3. 枚举首值
  if (schema.example !== undefined) return schema.example;
  const ex = pickExamples(schema.examples);
  if (ex !== undefined) return ex;
  if (schema.default !== undefined) return schema.default;
  if (Array.isArray(schema.enum) && schema.enum.length > 0) return schema.enum[0];

  // 组合关键字：allOf 合并各分支的对象，oneOf / anyOf 取首个分支
  if (Array.isArray(schema.allOf) && schema.allOf.length > 0) {
    const merged: Record<string, unknown> = {};
    for (const part of schema.allOf) {
      const v = r.enter(null, where, () => build(part, r, where));
      if (isRecord(v)) Object.assign(merged, v);
    }
    Object.assign(merged, buildObject(schema, r, where));
    return merged;
  }
  const branches = Array.isArray(schema.oneOf) ? schema.oneOf : schema.anyOf;
  if (Array.isArray(branches) && branches.length > 0) {
    return r.enter(null, where, () => build(branches[0], r, where));
  }

  // 4. 依 type + format 生成占位
  switch (normalizeType(schema)) {
    case "object":
      return buildObject(schema, r, where);
    case "array": {
      if (schema.items === undefined) return [];
      const item = r.enter(null, where, () => build(schema.items, r, where));
      return [item];
    }
    case "string": {
      const fmt = typeof schema.format === "string" ? schema.format : "";
      return fmt in STRING_PLACEHOLDERS ? STRING_PLACEHOLDERS[fmt] : "string";
    }
    case "integer":
    case "number":
      return 0;
    case "boolean":
      return false;
    default:
      return null;
  }
}

/** 由 schema 生成示例值（纯数据，未序列化）。 */
export function sampleFromSchema(schema: unknown, r: RefResolver, where: string): unknown {
  return build(schema, r, where);
}

/** 由 schema 生成示例请求体文本（缩进 2，与工具内其他 JSON 缩进一致）。 */
export function sampleBodyText(schema: unknown, r: RefResolver, where: string): string {
  const value = build(schema, r, where);
  return JSON.stringify(value ?? {}, null, 2);
}

/** 参数值：取示例的标量形式；对象/数组序列化为紧凑 JSON。 */
export function sampleParamValue(schema: unknown, r: RefResolver, where: string): string {
  const v = build(schema, r, where);
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

/** 媒体类型是否为 JSON（含 `application/vnd.x+json` 一类）。 */
export function isJsonMediaType(mediaType: string): boolean {
  return /\bjson\b/i.test(mediaType);
}

/**
 * 由 3.x 的 `requestBody.content` 生成示例请求体文本。
 * 无 JSON 媒体类型时返回 null 并记 issue（表单等类型首版不支持，降级为空 body）。
 */
export function sampleBodyFromContent(
  content: unknown,
  r: RefResolver,
  where: string,
  issues: ImportIssue[]
): string | null {
  if (!isRecord(content)) return null;
  const types = Object.keys(content);
  if (types.length === 0) return null;

  const jsonType = types.find(isJsonMediaType);
  if (!jsonType) {
    pushIssue(issues, {
      type: "body-unsupported",
      where,
      message: `请求体类型 ${types.join(" / ")} 首版不支持，已生成空 Body`,
    });
    return null;
  }

  const media = content[jsonType];
  if (!isRecord(media)) return null;

  // 媒体类型层的 example / examples 优先于 schema 推断
  if (media.example !== undefined) return JSON.stringify(media.example, null, 2);
  const ex = pickExamples(media.examples);
  if (ex !== undefined) return JSON.stringify(ex, null, 2);
  if (media.schema === undefined) return null;
  return sampleBodyText(media.schema, r, where);
}
