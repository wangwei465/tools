import { splitWords } from "../naming";

/**
 * 标识符处理——四个生成器共用。
 *
 * JSON 键名可以是任意字符串，目标语言的标识符不能。转义规则集中在这里，
 * 避免每个生成器各写一份「怎么算合法」而彼此漂移。
 */

/** 已被转义的字段：生成器把这些交给面板作为需人工确认项。 */
export interface EscapeInfo {
  key: string;
  identifier: string;
}

const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** 是否可直接作为标识符（未考虑关键字）。 */
export function isPlainIdentifier(key: string): boolean {
  return IDENT_RE.test(key);
}

/** 保留字母数字下划线，其余按分词后重组；首字符非法时补前缀。 */
function sanitize(key: string, prefix: string): string {
  const cleaned = key.replace(/[^A-Za-z0-9_]/g, " ").trim();
  const words = splitWords(cleaned);
  const joined = words.length > 0 ? words.join("_") : "field";
  return /^[A-Za-z_]/.test(joined) ? joined : `${prefix}${joined}`;
}

/** 转义为合法的 camelCase 标识符（Java 侧）。 */
export function toCamelIdentifier(key: string, keywords: ReadonlySet<string>): string {
  const words = splitWords(sanitize(key, "f"));
  const name = words
    .map((w, i) => (i === 0 ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1).toLowerCase()))
    .join("");
  const safe = /^[A-Za-z_]/.test(name) ? name : `f${name}`;
  return keywords.has(safe) ? `${safe}Value` : safe;
}

/** 转义为合法的 PascalCase 导出标识符（Go 侧）。 */
export function toPascalIdentifier(key: string, keywords: ReadonlySet<string>): string {
  const words = splitWords(sanitize(key, "F"));
  const name = words.map((w) => (w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : "")).join("");
  const safe = /^[A-Za-z_]/.test(name) ? name : `F${name}`;
  return keywords.has(safe.toLowerCase()) ? `${safe}Value` : safe;
}

export const JAVA_KEYWORDS: ReadonlySet<string> = new Set([
  "abstract", "assert", "boolean", "break", "byte", "case", "catch", "char", "class", "const",
  "continue", "default", "do", "double", "else", "enum", "extends", "final", "finally", "float",
  "for", "goto", "if", "implements", "import", "instanceof", "int", "interface", "long", "native",
  "new", "package", "private", "protected", "public", "return", "short", "static", "strictfp",
  "super", "switch", "synchronized", "this", "throw", "throws", "transient", "try", "void",
  "volatile", "while", "true", "false", "null",
]);

export const GO_KEYWORDS: ReadonlySet<string> = new Set([
  "break", "case", "chan", "const", "continue", "default", "defer", "else", "fallthrough", "for",
  "func", "go", "goto", "if", "import", "interface", "map", "package", "range", "return", "select",
  "struct", "switch", "type", "var",
]);

/** Go 的 json tag 中需要转义引号与反斜杠。 */
export function goTagValue(key: string): string {
  return key.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
