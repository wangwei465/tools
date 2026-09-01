import { isRecord, pushIssue, type ImportIssue } from "./types";
import { MAX_SCHEMA_DEPTH } from "./limits";

/**
 * 文档内 `$ref` 解析与递归护栏（api-openapi-import ④b）。
 *
 * 递归控制集中于此，示例生成只负责取值：
 * - 外部引用（不以 `#` 开头）与断链引用一律降级为占位并记 issue，不出网、不读文件；
 * - 引用路径栈拦截自引用与互引用两种循环，命中即截断；
 * - 深度计数器兜住无 `$ref` 的深层嵌套，保证任何输入都在有限步内返回。
 */

/** 反转义 JSON Pointer 段（RFC 6901）。 */
function unescapeSegment(seg: string): string {
  return seg.replace(/~1/g, "/").replace(/~0/g, "~");
}

/** 按 JSON Pointer 段逐层取值；任一层取不到返回 undefined。 */
function walkPointer(root: unknown, segments: string[]): unknown {
  let cur: unknown = root;
  for (const seg of segments) {
    if (!isRecord(cur)) return undefined;
    cur = cur[seg];
    if (cur === undefined) return undefined;
  }
  return cur;
}

/** 引用是否指向文档外部（含文件路径或 URL）。 */
export function isExternalRef(ref: string): boolean {
  return !ref.startsWith("#");
}

export class RefResolver {
  /** 当前展开中的 `$ref` 路径栈，用于循环检测。 */
  private readonly stack: string[] = [];
  /** 当前 schema 嵌套深度。 */
  private depth = 0;

  constructor(
    private readonly doc: Record<string, unknown>,
    readonly issues: ImportIssue[]
  ) {}

  /**
   * 解析 `#/` 开头的文档内引用。
   * 外部引用与断链返回 null 并记 issue，由调用方生成占位值。
   */
  resolve(ref: string, where: string): unknown {
    if (isExternalRef(ref)) {
      pushIssue(this.issues, {
        type: "ref-external",
        where: ref,
        message: `外部引用不解析（位于 ${where}），该字段已生成占位值`,
      });
      return null;
    }

    const raw = ref.slice(1).split("/").filter(Boolean).map(unescapeSegment);
    let target = walkPointer(this.doc, raw);
    if (target === undefined) {
      // $ref 是 URI，名称可能被百分号编码（如泛型 «T»）；原样查不到时再试解码
      const decoded = raw.map((s) => {
        try {
          return decodeURIComponent(s);
        } catch {
          return s;
        }
      });
      target = walkPointer(this.doc, decoded);
    }

    if (target === undefined) {
      pushIssue(this.issues, {
        type: "ref-missing",
        where: ref,
        message: `引用指向文档内不存在的路径（位于 ${where}），该字段已生成占位值`,
      });
      return null;
    }
    return target;
  }

  /**
   * 进入一层 schema 嵌套并执行 fn。
   *
   * `ref` 非空时一并压入引用栈做循环检测。命中循环或超出深度上限时不执行 fn，
   * 返回 null 并记 issue——这是「MUST NOT 无限递归」的唯一保障点。
   */
  enter<T>(ref: string | null, where: string, fn: () => T): T | null {
    if (ref !== null && this.stack.includes(ref)) {
      pushIssue(this.issues, {
        type: "ref-cycle",
        where: ref,
        message: `循环引用已在此处截断为占位值（位于 ${where}）`,
      });
      return null;
    }
    if (this.depth >= MAX_SCHEMA_DEPTH) {
      pushIssue(this.issues, {
        type: "depth-limit",
        where,
        message: `schema 嵌套超过 ${MAX_SCHEMA_DEPTH} 层，已在上限处截断`,
      });
      return null;
    }

    if (ref !== null) this.stack.push(ref);
    this.depth++;
    try {
      return fn();
    } finally {
      this.depth--;
      if (ref !== null) this.stack.pop();
    }
  }
}
