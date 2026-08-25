"use client";

import { useState } from "react";
import { beautify, minify, DIALECTS, DEFAULT_DIALECT, Dialect } from "@/lib/sql-kit/format";
import { SqlResult } from "@/lib/sql-kit/result";
import { PanelFrame, TextField, Select, CopyButton, ErrorBar, PrimaryButton } from "./shared";

/**
 * SQL 格式化与压缩。
 *
 * 结果由按钮显式触发而非实时计算：美化要走完整词法分析，挂在 onChange 上
 * 会让每次按键都重新解析半截 SQL，既慢又会持续报错。
 */
export function FormatPanel() {
  const [sql, setSql] = useState("");
  const [dialect, setDialect] = useState<Dialect>(DEFAULT_DIALECT);
  const [result, setResult] = useState<SqlResult<string> | null>(null);

  return (
    <PanelFrame title="格式化与压缩" desc="美化便于阅读，压缩便于粘贴进日志或配置；字符串内的空白不会被改动。">
      <TextField
        label="SQL"
        value={sql}
        onChange={(v) => {
          setSql(v);
          setResult(null);
        }}
        placeholder="select a,b from t where id=1 and n in (1,2)"
        minHeight="140px"
      />

      <div className="sqlk-toolbar">
        <Select
          label="方言"
          value={dialect}
          onChange={(v) => {
            setDialect(v);
            setResult(null);
          }}
          options={DIALECTS}
        />
        <PrimaryButton onClick={() => setResult(beautify(sql, dialect))} disabled={!sql.trim()}>
          美化
        </PrimaryButton>
        <PrimaryButton onClick={() => setResult(minify(sql))} disabled={!sql.trim()}>
          压缩
        </PrimaryButton>
      </div>

      {result?.ok && (
        <TextField
          label="结果"
          value={result.value!}
          readOnly
          minHeight="140px"
          actions={
            <>
              <button className="sqlk-copy" onClick={() => setSql(result.value!)}>
                替换输入
              </button>
              <CopyButton text={result.value!} />
            </>
          }
        />
      )}

      <ErrorBar error={result && !result.ok ? result.error : null} />
    </PanelFrame>
  );
}
