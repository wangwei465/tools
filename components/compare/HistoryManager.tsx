"use client";

import { useCallback, useEffect, Fragment, useState } from "react";

interface HeaderRow { key: string; value: string; }

interface HistRecord {
  id: number;
  name: string;
  url: string;
  method: string;
  headers: Record<string, string>;
  useCount: number;
  lastUsedAt: string;
  createdAt: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
}

const PAGE_SIZE = 10;

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleString("zh-CN", {
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return iso; }
}

function headersToRows(h: Record<string, string>): HeaderRow[] {
  return Object.entries(h).map(([key, value]) => ({ key, value }));
}
function rowsToHeaders(rows: HeaderRow[]): Record<string, string> {
  const obj: Record<string, string> = {};
  rows.forEach(({ key, value }) => { if (key.trim()) obj[key.trim()] = value; });
  return obj;
}

export function HistoryManager({ open, onClose }: Props) {
  const [records, setRecords] = useState<HistRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState("");
  const [loading, setLoading] = useState(false);

  // 删除确认：记录 id（null = 未在确认中）
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  // 编辑状态
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editUrl, setEditUrl] = useState("");
  const [editHeaders, setEditHeaders] = useState<HeaderRow[]>([]);
  const [editError, setEditError] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const load = useCallback((p: number, kw: string) => {
    setLoading(true);
    fetch(`/api/request-records?page=${p}&pageSize=${PAGE_SIZE}&keyword=${encodeURIComponent(kw)}`)
      .then((r) => r.json())
      .then((data: { records: HistRecord[]; total: number }) => {
        setRecords(data.records ?? []);
        setTotal(data.total ?? 0);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // 打开时重置并加载
  useEffect(() => {
    if (!open) return;
    setPage(1);
    setKeyword("");
    setEditingId(null);
    setConfirmDeleteId(null);
    load(1, "");
  }, [open, load]);

  // 搜索防抖
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => { setPage(1); load(1, keyword); }, 300);
    return () => clearTimeout(t);
  }, [keyword, open, load]);

  const goPage = (p: number) => { setPage(p); load(p, keyword); };

  /* ── 删除 ── */
  const handleDelete = (id: number) => {
    fetch(`/api/request-records/${id}`, { method: "DELETE" })
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) {
          setConfirmDeleteId(null);
          // 若删完当页仅剩 1 条且不是第 1 页，回退一页
          const remain = records.length - 1;
          const targetPage = remain === 0 && page > 1 ? page - 1 : page;
          load(targetPage, keyword);
          if (targetPage !== page) setPage(targetPage);
        }
      })
      .catch(() => {});
  };

  /* ── 编辑 ── */
  const startEdit = (rec: HistRecord) => {
    setEditingId(rec.id);
    setEditName(rec.name);
    setEditUrl(rec.url);
    setEditHeaders(headersToRows(rec.headers));
    setEditError(null);
  };
  const cancelEdit = () => { setEditingId(null); setEditError(null); };

  const saveEdit = async () => {
    if (!editName.trim()) { setEditError("名称不能为空"); return; }
    if (!editUrl.trim()) { setEditError("URL 不能为空"); return; }
    setEditSaving(true);
    setEditError(null);
    try {
      const res = await fetch(`/api/request-records/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName.trim(),
          url: editUrl.trim(),
          headers: rowsToHeaders(editHeaders),
        }),
      });
      const d = await res.json();
      if (!d.ok) { setEditError(d.error ?? "保存失败"); return; }
      setEditingId(null);
      load(page, keyword);
    } catch { setEditError("保存失败，请重试"); }
    finally { setEditSaving(false); }
  };

  const updateEditHeader = (i: number, patch: Partial<HeaderRow>) =>
    setEditHeaders((prev) => prev.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));

  if (!open) return null;

  const pageButtons = () => {
    const btns: number[] = [];
    const start = Math.max(1, page - 2);
    const end = Math.min(totalPages, page + 2);
    for (let i = start; i <= end; i++) btns.push(i);
    return btns;
  };

  return (
    <div className="hist-overlay" onClick={onClose}>
      <div className="hist-dialog" onClick={(e) => e.stopPropagation()}>
        {/* 头部 */}
        <div className="hist-header">
          <span className="hist-title">历史记录管理</span>
          <input
            className="hist-search"
            value={keyword}
            placeholder="搜索名称或地址…"
            onChange={(e) => setKeyword(e.target.value)}
          />
          <span className="hist-total">共 {total} 条</span>
          <button className="token-close" onClick={onClose}>✕</button>
        </div>

        {/* 表格 */}
        <div className="hist-body">
          {loading ? (
            <div className="hist-empty">加载中…</div>
          ) : records.length === 0 ? (
            <div className="hist-empty">暂无记录</div>
          ) : (
            <table className="hist-table">
              <thead>
                <tr>
                  <th>名称</th>
                  <th>请求地址</th>
                  <th style={{ textAlign: "center" }}>Headers</th>
                  <th style={{ textAlign: "center" }}>次数</th>
                  <th>最近使用</th>
                  <th style={{ textAlign: "center" }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {records.map((rec) => (
                <Fragment key={rec.id}>
                  <tr className={editingId === rec.id ? "hist-row-editing" : ""}>
                      <td className="hist-name-cell">{rec.name || <span style={{ color: "var(--text-muted)" }}>—</span>}</td>
                      <td className="hist-url-cell" title={rec.url}>{rec.url}</td>
                      <td style={{ textAlign: "center", color: "var(--text-muted)" }}>
                        {Object.keys(rec.headers).length}
                      </td>
                      <td style={{ textAlign: "center" }}>{rec.useCount}</td>
                      <td style={{ color: "var(--text-muted)", fontSize: "12px" }}>{fmtDate(rec.lastUsedAt)}</td>
                      <td>
                        {confirmDeleteId === rec.id ? (
                          <div className="hist-actions">
                            <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>确认删除？</span>
                            <button className="hist-btn-confirm-yes" onClick={() => handleDelete(rec.id)}>是</button>
                            <button className="hist-btn-confirm-no" onClick={() => setConfirmDeleteId(null)}>否</button>
                          </div>
                        ) : (
                          <div className="hist-actions">
                            <button className="hist-btn-edit" onClick={() => startEdit(rec)}>编辑</button>
                            <button className="hist-btn-del" onClick={() => setConfirmDeleteId(rec.id)}>删除</button>
                          </div>
                        )}
                      </td>
                    </tr>
                    {editingId === rec.id && (
                      <tr key={`edit-${rec.id}`}>
                        <td colSpan={6} className="hist-edit-row">
                          <div className="hist-edit-field">
                            <label>名称</label>
                            <input value={editName} onChange={(e) => setEditName(e.target.value)} />
                          </div>
                          <div className="hist-edit-field">
                            <label>URL</label>
                            <input value={editUrl} onChange={(e) => setEditUrl(e.target.value)} style={{ fontFamily: "monospace", fontSize: "12px" }} />
                          </div>
                          <div className="hist-edit-field">
                            <label>Headers</label>
                            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                              {editHeaders.map((row, i) => (
                                <div className="req-header-row" key={i}>
                                  <input className="req-h-key" value={row.key} placeholder="Header 名" onChange={(e) => updateEditHeader(i, { key: e.target.value })} />
                                  <input className="req-h-val" value={row.value} placeholder="值" onChange={(e) => updateEditHeader(i, { value: e.target.value })} />
                                  <button className="req-h-del" onClick={() => setEditHeaders((p) => p.filter((_, j) => j !== i))}>✕</button>
                                </div>
                              ))}
                              <button className="req-h-add" onClick={() => setEditHeaders((p) => [...p, { key: "", value: "" }])}>+ 添加 Header</button>
                            </div>
                          </div>
                          {editError && <div className="hist-edit-error">{editError}</div>}
                          <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", marginTop: "10px" }}>
                            <button className="btn-tool" onClick={cancelEdit} disabled={editSaving}>取消</button>
                            <button className="token-save" onClick={saveEdit} disabled={editSaving}>{editSaving ? "保存中…" : "保存"}</button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* 分页 */}
        {totalPages > 1 && (
          <div className="hist-footer">
            <button className="hist-page-btn" onClick={() => goPage(page - 1)} disabled={page <= 1}>‹</button>
            {page > 3 && <><button className="hist-page-btn" onClick={() => goPage(1)}>1</button><span className="hist-page-ellipsis">…</span></>}
            {pageButtons().map((p) => (
              <button key={p} className={`hist-page-btn${p === page ? " active" : ""}`} onClick={() => goPage(p)}>{p}</button>
            ))}
            {page < totalPages - 2 && <><span className="hist-page-ellipsis">…</span><button className="hist-page-btn" onClick={() => goPage(totalPages)}>{totalPages}</button></>}
            <button className="hist-page-btn" onClick={() => goPage(page + 1)} disabled={page >= totalPages}>›</button>
          </div>
        )}
      </div>
    </div>
  );
}
