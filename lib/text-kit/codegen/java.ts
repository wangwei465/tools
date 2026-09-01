import { InferResult, TypeNode, ReviewNote } from "./infer";
import { GenOutput } from "./typescript";
import { toCamelIdentifier, JAVA_KEYWORDS, isPlainIdentifier } from "./ident";

/**
 * Java POJO 生成器。
 *
 * 只生成纯字段 + 注释，不预设 Lombok / Jackson 任何注解框架：注解风格与团队
 * 约定强相关，生成了大概率要删。键名与字段名不一致时用注释保留原始键名。
 */

function render(node: TypeNode): string {
  switch (node.kind) {
    case "string":
      return "String";
    case "boolean":
      return "Boolean";
    case "int":
      return "Integer";
    case "long":
      return "Long";
    case "double":
      return "Double";
    case "any":
      return "Object";
    case "object":
      return node.name;
    case "array":
      return `List<${render(node.element)}>`;
  }
}

const usesList = (node: TypeNode): boolean => node.kind === "array";

export function generateJava(result: InferResult): GenOutput {
  const notes: ReviewNote[] = [];
  const needsList = result.types.some((m) => m.fields.some((f) => usesList(f.node)));

  const blocks = result.types.map((model) => {
    const lines = [`public class ${model.name} {`];
    for (const f of model.fields) {
      const name = toCamelIdentifier(f.key, JAVA_KEYWORDS);
      if (name !== f.key) {
        lines.push(`    /** 原始 JSON 键名：${f.key} */`);
        if (!isPlainIdentifier(f.key) || JAVA_KEYWORDS.has(f.key)) {
          notes.push({
            path: f.key,
            reason: `键名不是合法的 Java 标识符，已转义为 ${name}，反序列化时需自行配置映射`,
          });
        }
      }
      if (f.optional) lines.push(`    /** 该字段未在全部样本中出现 */`);
      lines.push(`    private ${render(f.node)} ${name};`);
    }
    lines.push("}");
    return lines.join("\n");
  });

  const header = needsList ? "import java.util.List;\n\n" : "";
  return { code: header + blocks.join("\n\n"), notes };
}
