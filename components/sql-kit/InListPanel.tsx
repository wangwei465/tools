"use client";

import { useMemo, useState } from "react";
import {
  buildInList,
  DEFAULT_OPTIONS,
  SPLIT_MODES,
  SplitMode,
  InListOptions,
} from "@/lib/sql-kit/inList";
import {
  PanelFrame,
  TextField,
  Select,
  Checkbox,
  InlineInput,
  CopyButton,
  ErrorBar,
} from "./shared";

/** IN 列表生成：把一列值转成可直接粘进 IN (...) 的形式。 */
export function InListPanel() {
  const [input, setInput] = useState("");
  const [quote, setQuote] = useState(DEFAULT_OPTIONS.quote);
  const [dedupe, setDedupe] = useState(DEFAULT_OPTIONS.dedupe);
  const [batchSize, setBatchSize] = useState("0");
  const [splitMode, setSplitMode] = useState<SplitMode>(DEFAULT_OPTIONS.splitMode);

  const options: InListOptions = {
    quote,
    dedupe,
    batchSize: Number(batchSize) || 0,
    splitMode,
  };

  const result = useMemo(
    () => (input.trim() ? buildInList(input, options) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [input, quote, dedupe, batchSize, splitMode]
  );

  const view = result?.ok ? result.value! : null;
  // 多批时用注释标出批次，粘进客户端后仍能看清边界
  const output = view
    ? view.batches.length === 1
      ? view.batches[0]
      : view.batches.map((b, i) => `-- 第 ${i + 1} 批（共 ${view.batches.length} 批）\n${b}`).join("\n\n")
    : "";

  return (
    <PanelFrame title="IN 列表生成" desc="把按行或分隔符排列的一列值转成 IN 子句可用的形式，支持去重与分批。">
      <TextField
        label="值列表"
        value={input}
        onChange={setInput}
        placeholder={"1001\n1002\n1003"}
        minHeight="140px"
      />

      <div className="sqlk-toolbar">
        <Checkbox label="带引号" checked={quote} onChange={setQuote} />
        <Checkbox label="去重" checked={dedupe} onChange={setDedupe} />
        <Select label="切分" value={splitMode} onChange={setSplitMode} options={SPLIT_MODES} width={110} />
        <InlineInput label="每批数量" value={batchSize} onChange={setBatchSize} placeholder="0 = 不分批" width={90} />
      </div>

      {view && (
        <>
          <TextField
            label={`结果（${view.total} 个值${view.removed > 0 ? `，已去重 ${view.removed} 个` : ""}${
              view.batches.length > 1 ? `，分 ${view.batches.length} 批` : ""
            }）`}
            value={output}
            readOnly
            minHeight="140px"
            actions={<CopyButton text={output} />}
          />
        </>
      )}

      <ErrorBar error={result && !result.ok ? result.error : null} />
    </PanelFrame>
  );
}
