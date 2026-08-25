import { ConvertResult, ok, err } from "./result";

/**
 * 字符编码排查与乱码还原。
 *
 * 浏览器 TextEncoder 按规范只支持 UTF-8，而 TextDecoder 支持 gbk / gb18030 /
 * big5 等。要把「乱码字符编回字节」就缺了工具，故用 TextDecoder 反向构建
 * 字符→字节表（约 2.4 万项，实测建表 ~20ms），惰性构建并按编码缓存，
 * 避免为一个方向引入 iconv-lite 这类重量级依赖。
 */

/** 逐字符视图的展示上限，防止粘贴长文本时把界面撑爆。 */
export const MAX_CHARS = 2000;

export interface CharInfo {
  /** 字符本身（增补平面字符由代理对组成，这里是完整字符） */
  char: string;
  codePoint: number;
  /** U+4E2D 形式 */
  codePointHex: string;
  /** UTF-8 字节，空格分隔的十六进制 */
  utf8: string;
  /** UTF-16 码元，空格分隔；代理对为两组 */
  utf16: string;
  /** Latin-1 字节；码位超过 0xFF 时为 "—" */
  latin1: string;
  /** \uXXXX 转义；增补平面为两段代理 */
  escapeU: string;
  /** 百分号转义（基于 UTF-8 字节） */
  percent: string;
  /** HTML 实体 */
  htmlEntity: string;
}

export interface CharsView {
  chars: CharInfo[];
  /** 输入的字符总数（按码位计） */
  total: number;
  truncated: boolean;
}

const NAMED_ENTITIES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&apos;",
};

const utf8Encoder = new TextEncoder();

function toHex(n: number, width: number): string {
  return n.toString(16).toUpperCase().padStart(width, "0");
}

function bytesToHex(bytes: Uint8Array | number[]): string {
  return Array.from(bytes)
    .map((b) => toHex(b, 2))
    .join(" ");
}

/** 逐字符展开为多种编码表示；按码位迭代以正确处理 emoji 等代理对字符。 */
export function inspectChars(text: string): CharsView {
  const codePoints = Array.from(text);
  const truncated = codePoints.length > MAX_CHARS;
  const slice = truncated ? codePoints.slice(0, MAX_CHARS) : codePoints;

  const chars = slice.map<CharInfo>((char) => {
    const codePoint = char.codePointAt(0)!;
    const utf8Bytes = utf8Encoder.encode(char);
    const units: number[] = [];
    for (let i = 0; i < char.length; i += 1) units.push(char.charCodeAt(i));

    return {
      char,
      codePoint,
      codePointHex: `U+${toHex(codePoint, 4)}`,
      utf8: bytesToHex(utf8Bytes),
      utf16: units.map((u) => toHex(u, 4)).join(" "),
      latin1: codePoint <= 0xff ? toHex(codePoint, 2) : "—",
      escapeU: units.map((u) => `\\u${toHex(u, 4)}`).join(""),
      percent: Array.from(utf8Bytes)
        .map((b) => `%${toHex(b, 2)}`)
        .join(""),
      htmlEntity: NAMED_ENTITIES[char] ?? `&#x${toHex(codePoint, 4)};`,
    };
  });

  return { chars, total: codePoints.length, truncated };
}

/* ─── 编码反查表 ───────────────────────────────────────────── */

/** 探测当前运行环境是否支持该编码，不支持的候选静默跳过。 */
export function isEncodingSupported(encoding: string): boolean {
  try {
    new TextDecoder(encoding);
    return true;
  } catch {
    return false;
  }
}

/** 模块级缓存：同一编码的反查表只构建一次。 */
const tableCache = new Map<string, Map<string, number[]> | null>();

/**
 * 用 TextDecoder 反向构建「字符 → 字节」表。
 *
 * 覆盖单字节 0x00-0x7F 与双字节 0x81-0xFE / 0x40-0xFE，这是 GBK / Big5 等
 * 双字节编码的有效区间；重复映射保留先出现的（低字节序列优先）。
 */
function reverseTable(encoding: string): Map<string, number[]> | null {
  const cached = tableCache.get(encoding);
  if (cached !== undefined) return cached;

  if (!isEncodingSupported(encoding)) {
    tableCache.set(encoding, null);
    return null;
  }

  const decoder = new TextDecoder(encoding);
  const map = new Map<string, number[]>();

  for (let b = 0; b < 0x80; b += 1) {
    const s = decoder.decode(new Uint8Array([b]));
    if (s.length === 1 && !map.has(s)) map.set(s, [b]);
  }

  for (let lead = 0x81; lead <= 0xfe; lead += 1) {
    for (let trail = 0x40; trail <= 0xfe; trail += 1) {
      const s = decoder.decode(new Uint8Array([lead, trail]));
      if (s.length === 1 && s !== "�" && !map.has(s)) map.set(s, [lead, trail]);
    }
  }

  tableCache.set(encoding, map);
  return map;
}

/** 编码结果；dropped 为被丢弃的替换字符个数（信息已不可逆）。 */
interface EncodedBytes {
  bytes: Uint8Array;
  dropped: number;
}

/**
 * 把文本按指定编码转回字节。
 *
 * latin-1 走直通换算（码位 0-255 即字节值），这是真正的 ISO-8859-1；
 * 若改用 TextDecoder('latin1') 建表会落到 windows-1252，两者在 0x80-0x9F
 * 区间并不一致。其余编码走反查表。
 *
 * U+FFFD 特殊处理：中文的 UTF-8 字节数是 3 的倍数，被双字节编码误读时末尾
 * 必然落单并变成 U+FFFD——这是最常见的乱码形态。这类字符对应的原字节已经
 * 丢失，跳过它继续还原其余部分，远好过让整个候选作废。其他表外字符则说明
 * 该文本根本不可能由这个编码产生，候选作废。
 */
function encodeWith(text: string, encoding: string): EncodedBytes | null {
  if (encoding === "latin-1") {
    const out: number[] = [];
    let dropped = 0;
    for (const char of text) {
      if (char === "�") {
        dropped += 1;
        continue;
      }
      const code = char.codePointAt(0)!;
      if (code > 0xff) return null;
      out.push(code);
    }
    return { bytes: new Uint8Array(out), dropped };
  }

  const table = reverseTable(encoding);
  if (!table) return null;

  const out: number[] = [];
  let dropped = 0;
  for (const char of text) {
    if (char === "�") {
      dropped += 1;
      continue;
    }
    const bytes = table.get(char);
    if (!bytes) return null;
    out.push(...bytes);
  }
  return { bytes: new Uint8Array(out), dropped };
}

/* ─── 乱码还原 ─────────────────────────────────────────────── */

export interface RestoreCandidate {
  /** 人话描述这次还原假设的是哪种误读 */
  label: string;
  text: string;
  /** 可信度 0-100，越高越像正常文本 */
  score: number;
  /** 结果含 U+FFFD：信息在误解码时已丢失，无法完整还原 */
  lossy: boolean;
}

export interface RestoreResult {
  candidates: RestoreCandidate[];
  /** 输入本身就含 U+FFFD：信息在产生乱码时已丢失，任何候选都不可能完整还原 */
  inputLossy: boolean;
  /** 因当前环境不支持而跳过的编码，供界面标注 */
  skipped: string[];
}

/** 候选组合：绝大多数中文乱码都是 UTF-8 字节被按单/双字节编码读出。 */
const CANDIDATES: Array<{ wrong: string; label: string }> = [
  { wrong: "latin-1", label: "UTF-8 字节被当作 Latin-1 读" },
  { wrong: "gbk", label: "UTF-8 字节被当作 GBK 读" },
  { wrong: "gb18030", label: "UTF-8 字节被当作 GB18030 读" },
  { wrong: "big5", label: "UTF-8 字节被当作 Big5 读" },
];

/** CJK 统一表意文字（基本区 + 扩展 A）：还原结果里 CJK 占比高，说明大概率对了。 */
const CJK = /[\u4E00-\u9FFF\u3400-\u4DBF]/;
/** 控制字符（不含 \t \n \r）：出现得多说明这个候选还原错了。 */
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

/**
 * 给还原结果打分。
 *
 * 光看 CJK 占比会被「二次乱码」骗过去——把乱码再错误解码一次，出来的生僻字
 * 同样全是 CJK，占比一样满分。真正的分水岭是长度：乱码一定比原文长（一个汉字
 * 的 3 个 UTF-8 字节被拆成 2~3 个乱码字符），所以正确的还原必然是收缩的，
 * 而二次乱码会继续膨胀。长度比因此是比字符种类更强的信号。
 */
function scoreText(text: string, originalLength: number): { score: number; lossy: boolean } {
  const chars = Array.from(text);
  if (chars.length === 0) return { score: 0, lossy: false };

  let fffd = 0;
  let cjk = 0;
  let ctrl = 0;
  for (const c of chars) {
    if (c === "�") fffd += 1;
    else if (CJK.test(c)) cjk += 1;
    else if (CONTROL.test(c)) ctrl += 1;
  }

  const n = chars.length;
  const ratio = originalLength > 0 ? n / originalLength : 1;
  const lengthScore = ratio <= 1 ? 30 * (1 - ratio) : -60 * Math.min(ratio - 1, 1.5);

  const raw = 70 - (fffd / n) * 150 + (cjk / n) * 30 - (ctrl / n) * 120 + lengthScore;
  return { score: Math.round(Math.max(0, Math.min(100, raw))), lossy: fffd > 0 };
}

/**
 * 尝试还原被错误解码的文本。
 *
 * 正向：把乱码按「误解码用的编码」编回字节，再按 UTF-8 解读。
 * 反向：GBK 字节被按 UTF-8 读的情况——这类乱码通常已含 U+FFFD，
 * 信息不可逆，但仍给出候选并标注。
 */
export function restoreMojibake(garbled: string): ConvertResult<RestoreResult> {
  const text = garbled;
  if (!text.trim()) return err("请输入乱码文本");

  const inputLossy = text.includes("�");
  const utf8Decoder = new TextDecoder("utf-8");
  const candidates: RestoreCandidate[] = [];
  const skipped: string[] = [];

  for (const { wrong, label } of CANDIDATES) {
    // 环境不支持要标注给用户；字符不在表内只是这个候选不成立，属正常过滤
    if (wrong !== "latin-1" && !isEncodingSupported(wrong)) {
      skipped.push(wrong);
      continue;
    }
    const encoded = encodeWith(text, wrong);
    if (!encoded) continue;
    const restored = utf8Decoder.decode(encoded.bytes);
    if (restored === text) continue; // 没有变化的候选没有信息量
    const scored = scoreText(restored, text.length);
    candidates.push({
      label,
      text: restored,
      score: scored.score,
      lossy: scored.lossy || inputLossy || encoded.dropped > 0,
    });
  }

  // 反向候选：原文是 GBK 字节，被按 UTF-8 读
  if (isEncodingSupported("gbk")) {
    const bytes = utf8Encoder.encode(text);
    const restored = new TextDecoder("gbk").decode(bytes);
    if (restored !== text) {
      const scored = scoreText(restored, text.length);
      candidates.push({
        label: "GBK 字节被当作 UTF-8 读",
        text: restored,
        score: scored.score,
        lossy: scored.lossy || inputLossy,
      });
    }
  } else {
    skipped.push("gbk");
  }

  if (candidates.length === 0) {
    return err("没有可用的还原候选：该文本无法由常见的编码误读组合产生");
  }

  candidates.sort((a, b) => b.score - a.score);
  return ok<RestoreResult>({ candidates, inputLossy, skipped });
}

/* ─── 字节 → 文本 ──────────────────────────────────────────── */

/** 可选的解码编码，供 hex 解码下拉使用。 */
export const DECODE_ENCODINGS = ["gbk", "gb18030", "big5", "utf-8", "latin1", "shift_jis"] as const;

/**
 * 十六进制字节串解码为文本。
 * 接受空格 / 逗号 / 换行分隔，以及 `0x` 与 `\x` 前缀。
 */
export function decodeHexBytes(hex: string, encoding: string): ConvertResult<string> {
  const cleaned = hex
    .replace(/0x/gi, "")
    .replace(/\\x/gi, "")
    .replace(/[\s,;]/g, "");

  if (!cleaned) return err("请输入十六进制字节");
  if (!/^[0-9a-fA-F]+$/.test(cleaned)) return err("含有非十六进制字符");
  if (cleaned.length % 2 !== 0) return err(`十六进制字符数为 ${cleaned.length}，应为偶数（每两位一个字节）`);
  if (!isEncodingSupported(encoding)) return err(`当前环境不支持编码 ${encoding}`);

  const bytes = new Uint8Array(cleaned.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = parseInt(cleaned.slice(i * 2, i * 2 + 2), 16);
  }

  return ok(new TextDecoder(encoding).decode(bytes));
}
