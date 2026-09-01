import { TextResult, ok, err, errMessage } from "../result";
import { checkDepth } from "../limits";
import { splitWords } from "../naming";

/**
 * JSON 样本 → 中间结构模型。
 *
 * 推断层与目标语言完全解耦：这里只回答「这份样本长什么样」，不关心
 * TypeScript 还是 Go。新增一种目标语言只需新增一个生成器。
 *
 * JSON 样本里没有类型信息，任何生成器都在猜——区别只在于是否承认自己在猜。
 * 猜不出来的地方给一个不会误导的保守类型，并把字段写进 notes 让用户核对。
 */

export type TypeNode =
  | { kind: "string" }
  | { kind: "boolean" }
  | { kind: "int" }
  | { kind: "long" }
  | { kind: "double" }
  | { kind: "any" }
  | { kind: "object"; name: string }
  | { kind: "array"; element: TypeNode };

export interface TypeField {
  /** 原始 JSON 键名，生成器负责转义为合法标识符并保留此映射 */
  key: string;
  node: TypeNode;
  /** 未在全部数组元素中出现 */
  optional: boolean;
  /** 样本中出现过 null */
  nullable: boolean;
}

export interface TypeModel {
  name: string;
  fields: TypeField[];
}

/** 需人工确认的字段。 */
export interface ReviewNote {
  path: string;
  reason: string;
}

export interface InferResult {
  rootName: string;
  types: TypeModel[];
  notes: ReviewNote[];
}

interface Ctx {
  types: TypeModel[];
  used: Set<string>;
  notes: ReviewNote[];
}

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);

function addNote(ctx: Ctx, path: string, reason: string) {
  if (ctx.notes.some((n) => n.path === path && n.reason === reason)) return;
  ctx.notes.push({ path, reason });
}

/** 去复数：items → Item、categories → Category、classes → Class。 */
export function singularize(word: string): string {
  if (/ies$/i.test(word) && word.length > 3) return word.slice(0, -3) + "y";
  if (/(s|x|z|ch|sh)es$/i.test(word)) return word.slice(0, -2);
  if (/ss$/i.test(word)) return word;
  if (/s$/i.test(word) && word.length > 1) return word.slice(0, -1);
  return word;
}

/** 字段名 → 子类型名：PascalCase 化并去复数。 */
export function typeNameOf(hint: string): string {
  const words = splitWords(hint);
  if (words.length === 0) return "Type";
  const last = words.length - 1;
  const pascal = words
    .map((w, i) => {
      const base = i === last ? singularize(w) : w;
      return base ? base[0].toUpperCase() + base.slice(1).toLowerCase() : "";
    })
    .join("");
  return /^[A-Za-z]/.test(pascal) ? pascal : `Type${pascal}`;
}

/** 命名冲突时追加数字后缀。 */
function uniqueName(ctx: Ctx, base: string): string {
  if (!ctx.used.has(base)) {
    ctx.used.add(base);
    return base;
  }
  let i = 2;
  while (ctx.used.has(`${base}${i}`)) i += 1;
  const name = `${base}${i}`;
  ctx.used.add(name);
  return name;
}

/** 数值形态判定：小数走浮点，超出安全整数范围走 64 位整数并需人工确认。 */
function numberNode(values: number[], path: string, ctx: Ctx): TypeNode {
  let hasDouble = false;
  let hasLong = false;
  for (const n of values) {
    if (!Number.isInteger(n)) {
      hasDouble = true;
    } else if (!Number.isSafeInteger(n)) {
      hasLong = true;
      addNote(ctx, path, "整数超出 JavaScript 安全整数范围，已按 64 位整数生成，请确认实际精度");
    }
  }
  if (hasDouble) return { kind: "double" };
  if (hasLong) return { kind: "long" };
  return { kind: "int" };
}

const categoryOf = (v: unknown): string => {
  if (Array.isArray(v)) return "array";
  if (isPlainObject(v)) return "object";
  return typeof v;
};

/**
 * 由一组同位置的样本值推断类型。
 *
 * 「一组」而非「一个」是关键：数组元素、以及同一字段在多个元素中的取值，
 * 都走这一条路径，字段并集与可选性推断因此只有一份实现。
 */
function inferValues(
  samples: unknown[],
  hint: string,
  path: string,
  ctx: Ctx
): { node: TypeNode; nullable: boolean } {
  const nullable = samples.some((v) => v === null);
  const present = samples.filter((v) => v !== null && v !== undefined);

  if (present.length === 0) {
    addNote(ctx, path, "样本中只有 null，类型不可推断，已按任意类型生成");
    return { node: { kind: "any" }, nullable: true };
  }

  const categories = new Set(present.map(categoryOf));
  if (categories.size > 1) {
    addNote(ctx, path, "样本中的取值类型不一致，已降级为任意类型");
    return { node: { kind: "any" }, nullable };
  }

  const category = [...categories][0];

  if (category === "object") {
    const objects = present as Record<string, unknown>[];
    const keys: string[] = [];
    for (const o of objects) {
      for (const k of Object.keys(o)) if (!keys.includes(k)) keys.push(k);
    }
    if (keys.length === 0) {
      addNote(ctx, path, "样本为空对象，字段不可推断，已生成空类型");
    }

    const name = uniqueName(ctx, typeNameOf(hint));
    const model: TypeModel = { name, fields: [] };
    ctx.types.push(model); // 先入列表，保证父类型排在子类型之前

    for (const key of keys) {
      const owners = objects.filter((o) => Object.prototype.hasOwnProperty.call(o, key));
      const child = inferValues(
        owners.map((o) => o[key]),
        key,
        path ? `${path}.${key}` : key,
        ctx
      );
      model.fields.push({
        key,
        node: child.node,
        optional: owners.length < objects.length,
        nullable: child.nullable,
      });
    }
    return { node: { kind: "object", name }, nullable };
  }

  if (category === "array") {
    const flat = (present as unknown[][]).flat();
    if (flat.length === 0) {
      addNote(ctx, path, "样本为空数组，元素类型不可推断，已按任意类型生成");
      return { node: { kind: "array", element: { kind: "any" } }, nullable };
    }
    const element = inferValues(flat, singularize(hint), `${path}[]`, ctx);
    return { node: { kind: "array", element: element.node }, nullable };
  }

  if (category === "number") {
    return { node: numberNode(present as number[], path, ctx), nullable };
  }
  if (category === "boolean") return { node: { kind: "boolean" }, nullable };
  if (category === "string") return { node: { kind: "string" }, nullable };

  addNote(ctx, path, "无法识别的取值类型，已降级为任意类型");
  return { node: { kind: "any" }, nullable };
}

/** 解析并推断 JSON 样本；根需为对象或对象数组。 */
export function inferFromJson(text: string, rootHint = "Root"): TextResult<InferResult> {
  if (!text.trim()) return err<InferResult>("请输入 JSON 样本");

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    return err<InferResult>(`JSON 解析失败：${errMessage(e)}`);
  }

  const depth = checkDepth(parsed);
  if (!depth.ok) return err<InferResult>(depth.error!);

  const samples = Array.isArray(parsed) ? parsed : [parsed];
  if (samples.length === 0) return err<InferResult>("JSON 数组为空，没有可推断的结构");
  if (!samples.every((s) => isPlainObject(s))) {
    return err<InferResult>("根需为对象或对象数组，标量与标量数组无法生成类型定义");
  }

  const ctx: Ctx = { types: [], used: new Set(), notes: [] };
  const root = inferValues(samples, rootHint, "", ctx);
  const rootName = root.node.kind === "object" ? root.node.name : rootHint;

  return ok<InferResult>({ rootName, types: ctx.types, notes: ctx.notes });
}
