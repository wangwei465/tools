import { NextResponse } from "next/server";
import { searchRecords, insertRecord, checkRecordExists, getPagedRecords } from "@/lib/db";

/**
 * GET  /api/request-records?keyword=          → 下拉搜索（返回数组）
 * GET  /api/request-records?page=1&pageSize=10 → 管理分页（返回 { records, total }）
 * POST /api/request-records                   → 保存记录（名称唯一性校验）
 * POST /api/request-records?checkOnly=1       → 实时验证名称是否重复
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const keyword = searchParams.get("keyword") ?? "";
  const page = searchParams.get("page");

  // 有 page 参数 → 分页模式（管理弹窗用）
  if (page !== null) {
    const pageNum = Math.max(1, Number(page) || 1);
    const pageSize = Math.min(50, Math.max(1, Number(searchParams.get("pageSize")) || 10));
    return NextResponse.json(getPagedRecords(pageNum, pageSize, keyword));
  }

  // 无 page 参数 → 下拉搜索模式
  return NextResponse.json(searchRecords(keyword));
}

export async function POST(request: Request) {
  let body: { name?: string; url?: string; method?: string; headers?: Record<string, string> };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "请求体不是合法 JSON" }, { status: 400 });
  }

  const name = body.name?.trim() ?? "";
  const url = body.url?.trim() ?? "";
  const method = (body.method ?? "GET").toUpperCase();

  if (!name) return NextResponse.json({ ok: false, error: "名称不能为空" }, { status: 400 });
  if (!url)  return NextResponse.json({ ok: false, error: "URL 不能为空" }, { status: 400 });

  const checkOnly = new URL(request.url).searchParams.get("checkOnly") === "1";
  if (checkOnly) {
    const exists = checkRecordExists(url, method, name);
    return NextResponse.json({ ok: !exists, exists });
  }

  try {
    insertRecord({ name, url, method, headers: body.headers ?? {} });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "保存失败";
    return NextResponse.json({ ok: false, error: msg }, { status: 409 });
  }
}
