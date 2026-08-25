"use client";

import { useMemo, useState } from "react";
import {
  buildInsert,
  SOURCE_FORMATS,
  OUTPUT_FORMS,
  SourceFormat,
  OutputForm,
  InsertOptions,
} from "@/lib/sql-kit/insert";
import { DELIMITERS } from "@/lib/sql-kit/csv";
import {
  PanelFrame,
  TextField,
  Select,
  Checkbox,
  InlineInput,
  CopyButton,
  ErrorBar,
} from "./shared";

const CSV_SAMPLE = "id,name,score\n1,张三,9.5\n2,李四,";
const JSON_SAMPLE = '[{"id":1,"name":"张三"},{"id":2,"name":"李四"}]';

/** 由 CSV 或 JSON 数组生成 INSERT 语句。 */
export function InsertPanel() {
  const [input, setInput] = useState("");
  const [table, setTable] = useState("");
  const [format, setFormat] = useState<SourceFormat>("csv");
  const [output, setOutput] = useState<OutputForm>("multi");
  const [delimiter, setDelimiter] = useState<string>(",");
  const [hasHeader, setHasHeader] = useState(true);

  const options: InsertOptions = { table, format, output, delimiter, hasHeader };

  const result = useMemo(
    () => (input.trim() && table.trim() ? buildInsert(input, options) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [input, table, format, output, delimiter, hasHeader]
  );

  return (
    <PanelFrame title="INSERT 生成" desc="由 CSV 或 JSON 对象数组生成 INSERT 语句；数值与布尔不加引号，空值输出 null。">
      <div className="sqlk-toolbar">
        <InlineInput label="表名" value={table} onChange={setTable} placeholder="user" width={180} />
        <Select label="来源" value={format} onChange={setFormat} options={SOURCE_FORMATS} width={110} />
        <Select label="输出" value={output} onChange={setOutput} options={OUTPUT_FORMS} width={110} />
        {format === "csv" && (
          <>
            <Select label="分隔符" value={delimiter} onChange={setDelimiter} options={DELIMITERS} width={100} />
            <Checkbox label="首行为表头" checked={hasHeader} onChange={setHasHeader} />
          </>
        )}
      </div>

      <TextField
        label={format === "csv" ? "CSV 数据" : "JSON 数组"}
        value={input}
        onChange={setInput}
        placeholder={format === "csv" ? CSV_SAMPLE : JSON_SAMPLE}
        minHeight="160px"
      />

      {result?.ok && (
        <TextField
          label="生成结果"
          value={result.value!}
          readOnly
          minHeight="160px"
          actions={<CopyButton text={result.value!} />}
        />
      )}

      <ErrorBar error={result && !result.ok ? result.error : null} />
    </PanelFrame>
  );
}
