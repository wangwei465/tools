/**
 * 文本度量统计。
 *
 * UTF-8 字节数用 TextEncoder 算而不是 length——中文一个字符是 3 字节，
 * 用长度冒充字节数会在「字段长度够不够」这类判断上直接给出错误答案。
 */

export interface TextStats {
  chars: number;
  charsNoWhitespace: number;
  lines: number;
  words: number;
  bytes: number;
  maxLineLength: number;
  minLineLength: number;
}

const EMPTY: TextStats = {
  chars: 0,
  charsNoWhitespace: 0,
  lines: 0,
  words: 0,
  bytes: 0,
  maxLineLength: 0,
  minLineLength: 0,
};

export function computeStats(text: string): TextStats {
  if (text === "") return { ...EMPTY };

  const normalized = text.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  const lengths = lines.map((l) => l.length);

  return {
    chars: text.length,
    charsNoWhitespace: text.replace(/\s/g, "").length,
    lines: lines.length,
    words: normalized.trim() === "" ? 0 : normalized.trim().split(/\s+/).length,
    bytes: new TextEncoder().encode(text).length,
    maxLineLength: Math.max(...lengths),
    minLineLength: Math.min(...lengths),
  };
}
