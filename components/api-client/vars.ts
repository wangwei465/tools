import type { ApiVariable, RequestDraft } from "./types";

/**
 * 变量解析与 {{key}} 替换引擎（api-variable-substitution ③）。
 *
 * 纯函数：解析生效变量映射（环境 > 全局，仅 enabled），并对请求各字符串字段做单趟替换。
 * 单趟：String.replace 一次遍历，替换入的值不再被二次扫描（规避自引用成环）。
 */

const VAR_RE = /\{\{\s*([^}]+?)\s*\}\}/g;

/** 解析生效变量映射：全局先入、激活环境覆盖；仅 enabled 且 key 非空。 */
export function resolveVars(variables: ApiVariable[], activeEnvId: number | null): Map<string, string> {
  const map = new Map<string, string>();
  // 全局（envId=null）先入
  for (const v of variables) {
    if (v.envId === null && v.enabled && v.key.trim()) map.set(v.key, v.value);
  }
  // 激活环境覆盖同名
  if (activeEnvId != null) {
    for (const v of variables) {
      if (v.envId === activeEnvId && v.enabled && v.key.trim()) map.set(v.key, v.value);
    }
  }
  return map;
}

/** 替换字符串中的 {{key}}；未定义的 key 原样保留并记入 missing。 */
export function substituteString(
  input: string,
  vars: Map<string, string>,
  missing?: Set<string>
): string {
  if (!input) return input;
  return input.replace(VAR_RE, (whole, rawKey: string) => {
    const key = rawKey.trim();
    if (vars.has(key)) return vars.get(key)!;
    missing?.add(key);
    return whole; // 未定义：原样保留
  });
}

/** 对 RequestDraft 各字符串字段替换，返回新 draft 与未定义变量清单。 */
export function substituteDraft(
  draft: RequestDraft,
  vars: Map<string, string>
): { draft: RequestDraft; missing: string[] } {
  const missing = new Set<string>();
  const s = (v: string) => substituteString(v, vars, missing);

  const out: RequestDraft = {
    ...draft,
    url: s(draft.url),
    params: draft.params.map((p) => ({ ...p, key: s(p.key), value: s(p.value) })),
    headers: draft.headers.map((h) => ({ ...h, key: s(h.key), value: s(h.value) })),
    body: {
      ...draft.body,
      raw: s(draft.body.raw),
      urlencoded: draft.body.urlencoded.map((kv) => ({ ...kv, key: s(kv.key), value: s(kv.value) })),
      formData: draft.body.formData.map((f) =>
        f.kind === "text"
          ? { ...f, key: s(f.key), value: s(f.value) }
          : { ...f, key: s(f.key) } // 文件字段仅替换字段名，不动文件内容
      ),
    },
    auth: {
      ...draft.auth,
      bearerToken: s(draft.auth.bearerToken),
      basicUser: s(draft.auth.basicUser),
      basicPassword: s(draft.auth.basicPassword),
      apiKeyName: s(draft.auth.apiKeyName),
      apiKeyValue: s(draft.auth.apiKeyValue),
    },
  };
  return { draft: out, missing: [...missing] };
}
