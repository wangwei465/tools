import { InferResult, TypeNode } from "./infer";
import { GenOutput } from "./typescript";

/**
 * JSON Schema 生成器（draft 2020-12）。
 *
 * 子类型放进 `$defs` 并以 `$ref` 引用，与其他三个生成器的具名子类型一一对应。
 * 键名在 JSON Schema 中是字符串，不存在标识符转义问题。
 */

type Schema = Record<string, unknown>;

function render(node: TypeNode): Schema {
  switch (node.kind) {
    case "string":
      return { type: "string" };
    case "boolean":
      return { type: "boolean" };
    case "int":
    case "long":
      return { type: "integer" };
    case "double":
      return { type: "number" };
    case "any":
      return {};
    case "object":
      return { $ref: `#/$defs/${node.name}` };
    case "array":
      return { type: "array", items: render(node.element) };
  }
}

export function generateJsonSchema(result: InferResult): GenOutput {
  const defs: Schema = {};

  for (const model of result.types) {
    const properties: Schema = {};
    const required: string[] = [];
    for (const f of model.fields) {
      const base = render(f.node);
      // 可空字段用 anyOf 表达，避免把 null 混进 type 里造成 $ref 与 type 并存
      properties[f.key] = f.nullable ? { anyOf: [base, { type: "null" }] } : base;
      if (!f.optional) required.push(f.key);
    }
    const schema: Schema = { type: "object", properties };
    if (required.length > 0) schema.required = required;
    defs[model.name] = schema;
  }

  const root: Schema = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $ref: `#/$defs/${result.rootName}`,
    $defs: defs,
  };

  return { code: JSON.stringify(root, null, 2), notes: [] };
}
