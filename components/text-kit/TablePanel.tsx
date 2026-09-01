"use client";

import { useMemo } from "react";
import { convertTable, TableFormat, TABLE_FORMATS, TableOptions } from "@/lib/text-kit/table";
import { DELIMITERS } from "@/lib/shared/csv";
import { checkSize } from "@/lib/text-kit/limits";
import {
  PanelFrame,
  TextField,
  Select,
  Checkbox,
  CopyButton,
  ErrorBar,
  HintBar,
} from "./shared";

export interface TableState {
  input: string;
  from: TableFormat;
  to: TableFormat;
  delimiter: string;
  hasHeader: boolean;
}

export const TABLE_INITIAL: TableState = {
  input: "",
  from: "csv",
  to: "json",
  delimiter: ",",
  hasHeader: true,
};

const DELIM_OPTIONS = DELIMITERS.map((d) => ({ value: d.value as string, label: d.label }));

/**
 * 表格转换面板。
 *
 * 所有转换走「源 → 二维表格中枢 → 目标」，面板本身不含任何格式间的直连逻辑。
 */
export function TablePanel({
  state,
  setState,
}: {
  state: TableState;
  setState: (patch: Partial<TableState>) => void;
}) {
  const result = useMemo(() => {
    const over = checkSize(state.input);
    if (over) return { text: "", error: over.error! };
    if (!state.input.trim()) return { text: "", error: "" };
    const options: TableOptions = { delimiter: state.delimiter, hasHeader: state.hasHeader };
    const r = convertTable(state.input, state.from, state.to, options);
    return r.ok ? { text: r.value!, error: "" } : { text: "", error: r.error! };
  }, [state]);

  return (
    <PanelFrame
      title="表格转换"
      desc="CSV / TSV、JSON 数组、Markdown 表格三向互转。分隔符与首行表头设置作用于 CSV / TSV 一侧。"
    >
      <HintBar>
        需要把表格转成 SQL <code>INSERT</code> 语句？用「<strong>SQL 工具</strong>」的 INSERT
        生成面板，本面板不提供该输出格式。
      </HintBar>

      <div className="tk-toolbar">
        <Select label="源格式" value={state.from} onChange={(v) => setState({ from: v })} options={TABLE_FORMATS} width={150} />
        <Select label="目标格式" value={state.to} onChange={(v) => setState({ to: v })} options={TABLE_FORMATS} width={150} />
        <Select label="分隔符" value={state.delimiter} onChange={(v) => setState({ delimiter: v })} options={DELIM_OPTIONS} width={110} />
        <Checkbox label="CSV 首行为表头" checked={state.hasHeader} onChange={(v) => setState({ hasHeader: v })} />
      </div>

      <TextField
        label="输入"
        value={state.input}
        onChange={(v) => setState({ input: v })}
        placeholder={"id,name\n1,张三"}
        minHeight="200px"
      />

      <ErrorBar error={result.error} />

      <TextField
        label="结果"
        value={result.text}
        readOnly
        minHeight="200px"
        actions={<CopyButton text={result.text} />}
      />
    </PanelFrame>
  );
}
