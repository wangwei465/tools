import { ConvertResult, ok, err } from "./result";

/**
 * 进制转换与位运算。
 *
 * 全程 BigInt：权限位图动辄超过 32 位，用 Number 的位运算符会被截断到 32 位，
 * 静默给出错误结果。表达式求值自研递归下降解析器，MUST NOT 使用 eval /
 * new Function——那等于把用户输入当代码执行。
 */

export type Radix = 2 | 8 | 10 | 16;

export const RADIX_LABEL: Record<Radix, string> = {
  2: "二进制",
  8: "八进制",
  10: "十进制",
  16: "十六进制",
};

const RADIX_PATTERN: Record<Radix, RegExp> = {
  2: /^[01]+$/,
  8: /^[0-7]+$/,
  10: /^\d+$/,
  16: /^[0-9a-fA-F]+$/,
};

const RADIX_PREFIX: Record<Radix, string> = { 2: "0b", 8: "0o", 10: "", 16: "0x" };

/** 置位列表的展示上限；权限位图实际远小于此，仅防极端输入把界面撑爆。 */
export const MAX_BIT_LIST = 256;

/** 一个数值在四种进制下的表示。 */
export interface RadixView {
  bin: string;
  oct: string;
  dec: string;
  hex: string;
}

/** 被置为 1 的位：序号（自 0 起）与对应权重。 */
export interface SetBit {
  index: number;
  weight: string;
}

export interface BitsView {
  bits: SetBit[];
  /** 位数超过 MAX_BIT_LIST 而截断 */
  truncated: boolean;
  /** 负数不做置位解读（补码位宽无限，无法给出确定的位序列） */
  unsupported: boolean;
}

/** 按指定进制解析为 BigInt，支持前导负号。 */
export function parseRadix(input: string, radix: Radix): ConvertResult<bigint> {
  const trimmed = input.trim();
  if (!trimmed) return err("请输入数值");

  const negative = trimmed.startsWith("-");
  const digits = negative ? trimmed.slice(1) : trimmed;
  if (!digits) return err("请输入数值");

  if (!RADIX_PATTERN[radix].test(digits)) {
    return err(`不是合法的${RADIX_LABEL[radix]}：含有该进制不允许的字符`);
  }

  try {
    const value = BigInt(RADIX_PREFIX[radix] + digits);
    return ok(negative ? -value : value);
  } catch {
    return err(`无法解析为${RADIX_LABEL[radix]}数值`);
  }
}

/** 输出四种进制表示。 */
export function formatAll(value: bigint): RadixView {
  return {
    bin: value.toString(2),
    oct: value.toString(8),
    dec: value.toString(10),
    hex: value.toString(16).toUpperCase(),
  };
}

/** 列出值中为 1 的位序号与权重，用于解读权限位与状态位图。 */
export function listSetBits(value: bigint): BitsView {
  if (value < 0n) return { bits: [], truncated: false, unsupported: true };

  const bits: SetBit[] = [];
  let rest = value;
  let index = 0;
  let truncated = false;

  while (rest > 0n) {
    if (index >= MAX_BIT_LIST) {
      truncated = true;
      break;
    }
    if (rest & 1n) bits.push({ index, weight: (1n << BigInt(index)).toString() });
    rest >>= 1n;
    index += 1;
  }

  return { bits, truncated, unsupported: false };
}

/* ─── 位运算表达式求值 ─────────────────────────────────────── */

type Token =
  | { type: "num"; value: bigint; pos: number }
  | { type: "op"; value: string; pos: number };

/** 词法分析：数字字面量支持 0x / 0b / 0o 前缀与十进制。 */
function tokenize(src: string): ConvertResult<Token[]> {
  const tokens: Token[] = [];
  let i = 0;

  while (i < src.length) {
    const ch = src[i];

    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }

    // 数字字面量
    if (/[0-9]/.test(ch)) {
      const start = i;
      let text: string;
      const prefix = src.slice(i, i + 2).toLowerCase();
      if (ch === "0" && (prefix === "0x" || prefix === "0b" || prefix === "0o")) {
        i += 2;
        const digitStart = i;
        const pattern = prefix === "0x" ? /[0-9a-fA-F]/ : prefix === "0b" ? /[01]/ : /[0-7]/;
        while (i < src.length && pattern.test(src[i])) i += 1;
        if (i === digitStart) return err(`位置 ${start + 1}：${prefix} 后缺少数字`);
        text = src.slice(start, i);
      } else {
        while (i < src.length && /[0-9]/.test(src[i])) i += 1;
        text = src.slice(start, i);
      }
      // 数字后紧跟字母属于笔误（如 0x1G、12abc），提前拦下而非静默截断
      if (i < src.length && /[0-9a-zA-Z]/.test(src[i])) {
        return err(`位置 ${i + 1}：数字后出现意外字符「${src[i]}」`);
      }
      tokens.push({ type: "num", value: BigInt(text), pos: start });
      continue;
    }

    // 双字符运算符
    const two = src.slice(i, i + 2);
    if (two === "<<" || two === ">>") {
      tokens.push({ type: "op", value: two, pos: i });
      i += 2;
      continue;
    }

    if ("&|^~()-".includes(ch)) {
      tokens.push({ type: "op", value: ch, pos: i });
      i += 1;
      continue;
    }

    if (ch === "<" || ch === ">") {
      return err(`位置 ${i + 1}：移位运算符应为 << 或 >>`);
    }

    return err(`位置 ${i + 1}：不支持的字符「${ch}」`);
  }

  return ok(tokens);
}

/**
 * 递归下降求值。优先级由低到高：| < ^ < & < 移位 < 一元(~ -) < 括号/字面量，
 * 与 C / Java 保持一致。
 */
class Parser {
  private pos = 0;

  constructor(private readonly tokens: Token[]) {}

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  private eatOp(...ops: string[]): string | null {
    const t = this.peek();
    if (t && t.type === "op" && ops.includes(t.value)) {
      this.pos += 1;
      return t.value;
    }
    return null;
  }

  atEnd(): boolean {
    return this.pos >= this.tokens.length;
  }

  /** 剩余未消费 token 的位置，用于报错定位。 */
  restPos(): number {
    return this.peek()?.pos ?? 0;
  }

  parseOr(): bigint {
    let left = this.parseXor();
    while (this.eatOp("|")) left |= this.parseXor();
    return left;
  }

  private parseXor(): bigint {
    let left = this.parseAnd();
    while (this.eatOp("^")) left ^= this.parseAnd();
    return left;
  }

  private parseAnd(): bigint {
    let left = this.parseShift();
    while (this.eatOp("&")) left &= this.parseShift();
    return left;
  }

  private parseShift(): bigint {
    let left = this.parseUnary();
    for (;;) {
      const op = this.eatOp("<<", ">>");
      if (!op) return left;
      const right = this.parseUnary();
      if (right < 0n) throw new Error("移位位数不能为负");
      if (right > 1024n) throw new Error("移位位数过大（上限 1024）");
      left = op === "<<" ? left << right : left >> right;
    }
  }

  private parseUnary(): bigint {
    const op = this.eatOp("~", "-");
    if (op === "~") return ~this.parseUnary();
    if (op === "-") return -this.parseUnary();
    return this.parsePrimary();
  }

  private parsePrimary(): bigint {
    const t = this.peek();
    if (!t) throw new Error("表达式不完整");

    if (t.type === "num") {
      this.pos += 1;
      return t.value;
    }

    if (t.value === "(") {
      this.pos += 1;
      const inner = this.parseOr();
      if (!this.eatOp(")")) throw new Error("缺少右括号");
      return inner;
    }

    throw new Error(`位置 ${t.pos + 1}：意外的「${t.value}」`);
  }
}

/** 求值位运算表达式，仅支持整数字面量与 & | ^ ~ << >> ( )。 */
export function evalBitExpr(src: string): ConvertResult<bigint> {
  if (!src.trim()) return err("请输入表达式");

  const lexed = tokenize(src);
  if (!lexed.ok) return err(lexed.error!);
  if (lexed.value!.length === 0) return err("请输入表达式");

  const parser = new Parser(lexed.value!);
  try {
    const value = parser.parseOr();
    if (!parser.atEnd()) {
      return err(`位置 ${parser.restPos() + 1}：表达式末尾有多余内容`);
    }
    return ok(value);
  } catch (e) {
    return err(e instanceof Error ? e.message : String(e));
  }
}
