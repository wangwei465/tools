import { NextResponse } from "next/server";
import { importCollection, type ImportCollectionInput } from "@/lib/db";
import { checkOperationCount } from "@/lib/api-client/openapi/limits";
import { isRecord } from "@/lib/api-client/openapi/types";
import type { RequestDraft } from "@/components/api-client/types";

/**
 * POST /api/collections/import —— OpenAPI 导入的单事务批量写入。
 *
 * 载荷是解析层产出的两层结构（根 → 分组 → 请求）与环境列表，名称为基名，
 * 重名消解与写入在 `importCollection` 的同一事务内完成。
 * 校验全部在事务外做完：结构非法或超出数量上限一律拒绝，不进入事务。
 */

/** 载荷校验：通过返回可写入的输入，失败返回可读原因。 */
function validate(body: unknown): { ok: true; input: ImportCollectionInput } | { ok: false; error: string } {
  if (!isRecord(body)) return { ok: false, error: "载荷不是对象" };

  const rootName = typeof body.rootName === "string" ? body.rootName.trim() : "";
  if (!rootName) return { ok: false, error: "缺少根文件夹名称" };

  if (!Array.isArray(body.groups)) return { ok: false, error: "groups 必须是数组" };
  if (!Array.isArray(body.environments)) return { ok: false, error: "environments 必须是数组" };

  const groups: ImportCollectionInput["groups"] = [];
  let total = 0;
  for (const g of body.groups) {
    if (!isRecord(g)) return { ok: false, error: "分组项不是对象" };
    const name = typeof g.name === "string" ? g.name.trim() : "";
    if (!name) return { ok: false, error: "分组名称不能为空" };
    if (!Array.isArray(g.requests)) return { ok: false, error: `分组「${name}」的 requests 必须是数组` };

    const requests: ImportCollectionInput["groups"][number]["requests"] = [];
    for (const r of g.requests) {
      if (!isRecord(r)) return { ok: false, error: `分组「${name}」含非对象的请求项` };
      const reqName = typeof r.name === "string" ? r.name.trim() : "";
      if (!reqName) return { ok: false, error: `分组「${name}」含无名称的请求项` };
      // 只做浅校验：definition 由解析层构造，此处防的是畸形载荷而非逐字段校对
      const def = r.definition;
      if (!isRecord(def) || typeof def.method !== "string" || typeof def.url !== "string") {
        return { ok: false, error: `请求「${reqName}」的定义结构非法` };
      }
      requests.push({ name: reqName, definition: def as unknown as RequestDraft });
      total++;
    }
    groups.push({ name, requests });
  }

  const environments: ImportCollectionInput["environments"] = [];
  for (const e of body.environments) {
    if (!isRecord(e)) return { ok: false, error: "环境项不是对象" };
    const name = typeof e.name === "string" ? e.name.trim() : "";
    const baseUrl = typeof e.baseUrl === "string" ? e.baseUrl.trim() : "";
    if (!name) return { ok: false, error: "环境名称不能为空" };
    if (!baseUrl) return { ok: false, error: `环境「${name}」缺少地址` };
    environments.push({ name, baseUrl });
  }

  const overLimit = checkOperationCount(total);
  if (overLimit) return { ok: false, error: overLimit };

  return { ok: true, input: { rootName, groups, environments } };
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "请求体不是合法 JSON" }, { status: 400 });
  }

  const checked = validate(body);
  if (!checked.ok) {
    return NextResponse.json({ ok: false, error: checked.error }, { status: 400 });
  }

  try {
    return NextResponse.json({ ok: true, result: importCollection(checked.input) });
  } catch (e) {
    // 事务已整体回滚，集合树与环境保持导入前的状态
    const detail = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { ok: false, error: `导入写入失败，已回滚全部改动：${detail}` },
      { status: 500 }
    );
  }
}
