import { JSONPath } from "jsonpath-plus";
import { ConvertResult, ok, err, errMessage } from "./result";

/**
 * JSONPath 提取核心。
 *
 * 对 JSON 文档按 JSONPath 表达式求值，返回全部命中的「值 + 路径」，供接口调试响应区
 * 与编码转换面板两个入口复用（UI 各自实现，共享止于本层）。
 *
 * 错误分三类且语义互不重叠：JSON 非法 / 表达式非法 / 零命中；其中零命中属正常结果，
 * 用户据此确认该路径确实不存在，故走 ok 而非 err。
 *
 * 护栏：限制文档长度与命中条数，避免超大响应卡死界面。阈值不沿用 regex.ts，理由见下。
 */

/**
 * 待求值 JSON 文档长度上限。
 *
 * 不沿用 regex.ts 的 MAX_TEXT_LENGTH（100_000）：那是针对手工粘贴的测试文本，
 * 而本能力面向 API 响应，ES 这类响应常达数百 KB，照搬会让工具在真实场景直接不可用。
 */
export const MAX_JSON_LENGTH = 1_000_000;

/**
 * 命中条数上限。
 *
 * 相比文档大小从严：瓶颈在结果渲染而非求值本身。超限时截断并如实告知总数，
 * 不静默丢弃——用户需要知道结果不完整。
 */
export const MAX_RESULTS = 1_000;

export interface JsonPathHit {
  /** 命中节点在源文档中的路径，形如 $['hits']['hits'][0]['_source']['id'] */
  path: string;
  /** 命中节点的值 */
  value: unknown;
}

export interface JsonPathResult {
  hits: JsonPathHit[];
  /** 是否因达到 MAX_RESULTS 而截断 */
  truncated: boolean;
  /** 截断前的命中总数 */
  total: number;
}

/**
 * 对 JSON 文本按 JSONPath 表达式求值。
 *
 * 顺序为：表达式校验 → 文档规模保护 → JSON 解析 → 求值。校验最先执行且开销极低，
 * 可在解析大文档前拦掉写错的表达式。
 */
export function evalJsonPath(jsonText: string, path: string): ConvertResult<JsonPathResult> {
  const invalidPath = validatePath(path);
  if (invalidPath) return err(invalidPath);

  if (!jsonText.trim()) return err("请输入 JSON 文档");
  if (jsonText.length > MAX_JSON_LENGTH) {
    return err(
      `JSON 文档过大（${jsonText.length} 字符，上限 ${MAX_JSON_LENGTH}），请缩减后再试`,
    );
  }

  let json: unknown;
  try {
    json = JSON.parse(jsonText);
  } catch (e) {
    return err(`JSON 解析失败：${errMessage(e)}`);
  }

  let raw: unknown;
  try {
    raw = JSONPath({
      path: path.trim(),
      json: json as object,
      resultType: "all",
      // 安全控制点：'safe' 使用最小脚本引擎（jsep）求值过滤表达式，符合 CSP。
      // 禁止改为 'native'——该模式走 eval/Function，正是本库两次 RCE（CWE-94）的成因。
      eval: "safe",
    });
  } catch (e) {
    return err(`表达式求值失败：${errMessage(e)}`);
  }

  const all = Array.isArray(raw) ? raw : [];
  const total = all.length;
  const truncated = total > MAX_RESULTS;
  const hits = (truncated ? all.slice(0, MAX_RESULTS) : all).map(toHit);

  return ok<JsonPathResult>({ hits, truncated, total });
}

/**
 * 表达式前置校验，通过返回 null，否则返回错误信息。
 *
 * 必须自建的原因：jsonpath-plus 不校验语法，对非法表达式宽容解析——`$[`、`$.` 会静默
 * 返回根文档（伪装成成功），`abc`、`$[0` 会静默返回空（伪装成零命中），仅残缺过滤
 * 表达式才真正抛错。JSONPath.toPathArray() 同样不抛错，库内无可用校验入口。
 *
 * 本函数为启发式校验而非完整语法分析，无法穷尽所有非法形式。发现新的绕过样本时，
 * 在此补充规则并在 jsonpath.test.ts 追加回归用例。
 */
function validatePath(path: string): string | null {
  const p = path.trim();
  if (!p) return "请输入 JSONPath 表达式";
  if (!p.startsWith("$")) return "表达式非法：JSONPath 必须以 $ 开头";
  if (p.endsWith(".")) return "表达式非法：路径不完整，不能以 . 结尾";
  const unbalanced = findUnbalanced(p);
  if (unbalanced) return `表达式非法：${unbalanced}`;
  return null;
}

/** 检查括号与引号配对；引号内的括号不参与计数（键名可含 [ ] 等字符）。 */
function findUnbalanced(p: string): string | null {
  let square = 0;
  let round = 0;
  let quote: string | null = null;

  for (let i = 0; i < p.length; i++) {
    const c = p[i];

    if (quote) {
      if (c === "\\") i++; // 跳过转义字符
      else if (c === quote) quote = null;
      continue;
    }

    if (c === "'" || c === '"') quote = c;
    else if (c === "[") square++;
    else if (c === "]" && --square < 0) return "] 多余或位置错误";
    else if (c === "(") round++;
    else if (c === ")" && --round < 0) return ") 多余或位置错误";
  }

  if (quote) return "引号未闭合";
  if (square > 0) return "[ 未闭合";
  if (round > 0) return "( 未闭合";
  return null;
}

/** resultType: 'all' 的节点规范化为对外的「值 + 路径」结构。 */
function toHit(node: unknown): JsonPathHit {
  const n = node as { path?: unknown; value?: unknown } | null;
  return {
    path: typeof n?.path === "string" ? n.path : "$",
    value: n?.value,
  };
}

/**
 * 命中值的展示文本：以 JSON 字面量呈现，使字符串 "5" 与数字 5 可区分。
 *
 * 置于 lib 层供两个入口共用——UI 各自实现，但这类纯格式化逻辑没有理由重复两遍。
 */
export function formatHitValue(v: unknown): string {
  if (v === undefined) return "undefined";
  return JSON.stringify(v) ?? String(v);
}
