"use client";

import { useMemo, useState } from "react";
import { fillSql, fillFromLog, splitLog } from "@/lib/sql-kit/fill";
import {
  PanelFrame,
  TextField,
  CopyButton,
  ErrorBar,
  NoticeBar,
  PrimaryButton,
} from "./shared";

type Mode = "split" | "log";

/**
 * SQL 日志参数填充。
 *
 * 两种入口：分栏输入（SQL 与参数各一栏）与整段日志（自动拆分）。
 * 后者是实际排障时最省事的路径——直接把日志复制进来。
 */
export function FillPanel() {
  const [mode, setMode] = useState<Mode>("split");
  const [sql, setSql] = useState("");
  const [params, setParams] = useState("");
  const [log, setLog] = useState("");

  const result = useMemo(() => {
    if (mode === "split") return sql.trim() ? fillSql(sql, params) : null;
    return log.trim() ? fillFromLog(log) : null;
  }, [mode, sql, params, log]);

  /** 把日志拆到分栏模式，便于手工微调后再填充。 */
  const splitToFields = () => {
    const parts = splitLog(log);
    if (!parts.ok) return;
    setSql(parts.value!.sql);
    setParams(parts.value!.params);
    setMode("split");
  };

  return (
    <PanelFrame
      title="日志参数填充"
      desc="把带 ? 占位符的 SQL 与参数列表合成完整语句；字符串与注释内的 ? 会被自动跳过。"
    >
      <div className="sqlk-toolbar">
        <div className="sqlk-seg">
          <button
            className={`sqlk-seg-btn${mode === "split" ? " active" : ""}`}
            onClick={() => setMode("split")}
          >
            分栏输入
          </button>
          <button
            className={`sqlk-seg-btn${mode === "log" ? " active" : ""}`}
            onClick={() => setMode("log")}
          >
            整段日志
          </button>
        </div>
        {mode === "log" && (
          <button className="sqlk-copy" onClick={splitToFields} disabled={!log.trim()}>
            拆分到分栏
          </button>
        )}
      </div>

      {mode === "split" ? (
        <>
          <TextField
            label="SQL（含 ? 占位符）"
            value={sql}
            onChange={setSql}
            placeholder="select id, name from user where id = ? and status = ?"
            minHeight="110px"
          />
          <TextField
            label="参数列表"
            value={params}
            onChange={setParams}
            placeholder="42(Integer), ACTIVE(String)"
            minHeight="70px"
          />
        </>
      ) : (
        <TextField
          label="MyBatis / JDBC 日志片段"
          value={log}
          onChange={setLog}
          placeholder={"==>  Preparing: select * from user where id = ?\n==> Parameters: 42(Integer)"}
          minHeight="150px"
        />
      )}

      {result?.ok && (
        <TextField
          label="填充结果"
          value={result.value!}
          readOnly
          minHeight="110px"
          actions={<CopyButton text={result.value!} />}
        />
      )}

      <ErrorBar error={result && !result.ok ? result.error : null} />

      <NoticeBar>
        结果供人工核对与手动执行。占位符扫描覆盖常见方言的字符串与注释语法，
        但不保证覆盖全部（如 PostgreSQL 的 <code>$$</code> 美元引用），请勿直接用于生产写操作。
      </NoticeBar>
    </PanelFrame>
  );
}
