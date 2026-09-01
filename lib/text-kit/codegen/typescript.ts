import { InferResult, TypeNode, ReviewNote } from "./infer";
import { isPlainIdentifier } from "./ident";

/**
 * TypeScript `interface` 生成器。
 *
 * 非法标识符靠引号键保留原始键名，无需改名——这是 TS 相比 Java / Go 的便利。
 */

export interface GenOutput {
  code: string;
  /** 生成过程中新增的需人工确认项（标识符转义等） */
  notes: ReviewNote[];
}

function render(node: TypeNode): string {
  switch (node.kind) {
    case "string":
      return "string";
    case "boolean":
      return "boolean";
    case "int":
    case "long":
    case "double":
      return "number";
    case "any":
      return "any";
    case "object":
      return node.name;
    case "array":
      return `${render(node.element)}[]`;
  }
}

export function generateTypeScript(result: InferResult): GenOutput {
  const notes: ReviewNote[] = [];
  const blocks = result.types.map((model) => {
    const lines = [`export interface ${model.name} {`];
    for (const f of model.fields) {
      const quoted = !isPlainIdentifier(f.key);
      if (quoted) {
        notes.push({ path: f.key, reason: "键名不是合法标识符，已用引号键保留原始名称" });
      }
      const name = quoted ? JSON.stringify(f.key) : f.key;
      const type = render(f.node) + (f.nullable ? " | null" : "");
      lines.push(`  ${name}${f.optional ? "?" : ""}: ${type};`);
    }
    lines.push("}");
    return lines.join("\n");
  });
  return { code: blocks.join("\n\n"), notes };
}
