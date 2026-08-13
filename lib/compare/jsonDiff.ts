/**
 * JSON 字段级 diff 引擎（结果层）。
 *
 * 递归比较两个 JSON 值，产出带 JSON Path 定位的差异列表，分三类：
 * - "changed"：路径两侧都存在但值不同
 * - "added"：路径仅在右侧存在（右侧多出）
 * - "removed"：路径仅在左侧存在（右侧缺失）
 *
 * 数组顺序敏感：按下标逐位比较；下标缺失一侧计为 added/removed。
 * 差异判定与 normalize 保持一致（同样是顺序敏感、值语义比较）。
 */

import type { JsonValue } from "./normalize";

export type DiffType = "changed" | "added" | "removed";

export interface DiffEntry {
  /** JSON Path，如 user.address.city 或 items[2].price；根为 "(root)" */
  path: string;
  type: DiffType;
  /** 左侧值（added 时为 undefined） */
  left?: JsonValue;
  /** 右侧值（removed 时为 undefined） */
  right?: JsonValue;
}

/** 拼接子路径：对象用 .key，数组用 [index]。 */
function joinPath(base: string, key: string | number): string {
  if (typeof key === "number") {
    return base === "" ? `[${key}]` : `${base}[${key}]`;
  }
  return base === "" ? key : `${base}.${key}`;
}

/** 展示用的路径：根路径显示为 (root)。 */
function displayPath(path: string): string {
  return path === "" ? "(root)" : path;
}

function isObject(v: JsonValue | undefined): v is { [key: string]: JsonValue } {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/**
 * 递归比较，收集差异到 out。
 * left/right 为 undefined 表示该路径在对应侧不存在。
 */
function walk(
  left: JsonValue | undefined,
  right: JsonValue | undefined,
  path: string,
  out: DiffEntry[]
): void {
  // 一侧缺失
  if (left === undefined && right !== undefined) {
    out.push({ path: displayPath(path), type: "added", right });
    return;
  }
  if (right === undefined && left !== undefined) {
    out.push({ path: displayPath(path), type: "removed", left });
    return;
  }
  if (left === undefined && right === undefined) {
    return;
  }

  // 两侧都是对象：按 key 并集递归
  if (isObject(left) && isObject(right)) {
    const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
    for (const key of Array.from(keys).sort()) {
      walk(left[key], right[key], joinPath(path, key), out);
    }
    return;
  }

  // 两侧都是数组：顺序敏感，按下标逐位比较
  if (Array.isArray(left) && Array.isArray(right)) {
    const max = Math.max(left.length, right.length);
    for (let i = 0; i < max; i++) {
      walk(
        i < left.length ? left[i] : undefined,
        i < right.length ? right[i] : undefined,
        joinPath(path, i),
        out
      );
    }
    return;
  }

  // 类型不同，或同为基本类型：直接按规范化字符串比较值
  if (JSON.stringify(left) !== JSON.stringify(right)) {
    out.push({ path: displayPath(path), type: "changed", left, right });
  }
}

/**
 * 比较两个 JSON 值，返回差异列表（已按路径排序、稳定）。
 * 无差异时返回空数组。
 */
export function diffJson(left: JsonValue, right: JsonValue): DiffEntry[] {
  const out: DiffEntry[] = [];
  walk(left, right, "", out);
  return out;
}
