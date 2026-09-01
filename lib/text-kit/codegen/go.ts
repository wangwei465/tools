import { InferResult, TypeNode, ReviewNote } from "./infer";
import { GenOutput } from "./typescript";
import { toPascalIdentifier, GO_KEYWORDS, goTagValue, isPlainIdentifier } from "./ident";

/**
 * Go `struct` 生成器。
 *
 * 字段名必须导出（首字母大写）才能被 encoding/json 处理，因此几乎总与原始
 * 键名不同——原始键名由 `json` tag 完整保留，这是 Go 侧天然的映射机制。
 */

function render(node: TypeNode): string {
  switch (node.kind) {
    case "string":
      return "string";
    case "boolean":
      return "bool";
    case "int":
      return "int";
    case "long":
      return "int64";
    case "double":
      return "float64";
    case "any":
      return "interface{}";
    case "object":
      return node.name;
    case "array":
      return `[]${render(node.element)}`;
  }
}

export function generateGo(result: InferResult): GenOutput {
  const notes: ReviewNote[] = [];

  const blocks = result.types.map((model) => {
    const rows = model.fields.map((f) => {
      const name = toPascalIdentifier(f.key, GO_KEYWORDS);
      if (!isPlainIdentifier(f.key)) {
        notes.push({
          path: f.key,
          reason: `键名不是合法的 Go 标识符，已转义为 ${name}，原始键名由 json tag 保留`,
        });
      }
      // 指针类型让「字段缺失」与「零值」可区分——可选字段必须能表达 nil
      const pointer = f.optional || f.nullable;
      const base = render(f.node);
      const type = pointer && !base.startsWith("[]") && base !== "interface{}" ? `*${base}` : base;
      const tag = `\`json:"${goTagValue(f.key)}${f.optional ? ",omitempty" : ""}"\``;
      return { name, type, tag };
    });

    const nameWidth = Math.max(1, ...rows.map((r) => r.name.length));
    const typeWidth = Math.max(1, ...rows.map((r) => r.type.length));
    const lines = [`type ${model.name} struct {`];
    for (const r of rows) {
      lines.push(`\t${r.name.padEnd(nameWidth)} ${r.type.padEnd(typeWidth)} ${r.tag}`);
    }
    lines.push("}");
    return lines.join("\n");
  });

  return { code: blocks.join("\n\n"), notes };
}
