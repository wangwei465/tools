"use client";

import { useMemo, useState } from "react";
import {
  parseRadix,
  formatAll,
  listSetBits,
  evalBitExpr,
  Radix,
  RADIX_LABEL,
} from "@/lib/convert/radix";
import { CopyButton, ErrorBar, ConverterFrame } from "./shared";

const RADICES: Radix[] = [2, 8, 10, 16];

const PLACEHOLDER: Record<Radix, string> = {
  2: "11111111",
  8: "377",
  10: "255",
  16: "FF",
};

/**
 * 进制转换与位运算。
 *
 * 四个进制输入框互相联动：以「最后编辑的那一个」为准解析，其余三个由结果推导，
 * 避免边输入边格式化把光标顶走。
 */
export function RadixConverter() {
  const [source, setSource] = useState<{ radix: Radix; text: string }>({ radix: 10, text: "" });
  const [expr, setExpr] = useState("");

  const parsed = useMemo(
    () => (source.text.trim() ? parseRadix(source.text, source.radix) : null),
    [source]
  );
  const value = parsed?.ok ? parsed.value! : null;
  const view = value !== null ? formatAll(value) : null;
  const bits = value !== null ? listSetBits(value) : null;

  const exprResult = useMemo(() => (expr.trim() ? evalBitExpr(expr) : null), [expr]);
  const exprView = exprResult?.ok ? formatAll(exprResult.value!) : null;

  /** 把表达式结果送进上方转换区，接着看它的各进制与置位。 */
  const useExprResult = () => {
    if (exprResult?.ok) setSource({ radix: 10, text: exprResult.value!.toString(10) });
  };

  const textOf = (radix: Radix): string => {
    if (radix === source.radix) return source.text;
    if (!view) return "";
    return radix === 2 ? view.bin : radix === 8 ? view.oct : radix === 10 ? view.dec : view.hex;
  };

  return (
    <ConverterFrame
      title="进制转换与位运算"
      desc="2/8/10/16 进制互转与位运算求值，全程 BigInt 精度；并列出置位便于解读权限位与状态位图。"
    >
      <div className="conv-result-grid">
        {RADICES.map((radix) => (
          <div className="conv-result-row" key={radix}>
            <span className="conv-result-label">{RADIX_LABEL[radix]}</span>
            <input
              className="conv-input conv-mono"
              value={textOf(radix)}
              placeholder={PLACEHOLDER[radix]}
              onChange={(e) => setSource({ radix, text: e.target.value })}
            />
            <CopyButton text={textOf(radix)} />
          </div>
        ))}
      </div>

      <ErrorBar error={parsed && !parsed.ok ? parsed.error : null} />

      {/* 置位解读 */}
      {bits && !bits.unsupported && bits.bits.length > 0 && (
        <div className="conv-field">
          <label className="conv-io-label">置位（共 {bits.bits.length} 位）</label>
          <div className="conv-bit-list">
            {bits.bits.map((b) => (
              <span className="conv-bit-chip" key={b.index}>
                <b>bit {b.index}</b>
                <span className="conv-bit-weight">{b.weight}</span>
              </span>
            ))}
            {bits.truncated && <span className="conv-bit-chip">…已截断</span>}
          </div>
        </div>
      )}
      {bits?.unsupported && (
        <div className="conv-notice">负数的补码位宽无限，不做置位解读。</div>
      )}

      {/* 位运算表达式 */}
      <div className="conv-field">
        <label className="conv-io-label">位运算表达式（支持 &amp; | ^ ~ &lt;&lt; &gt;&gt; 与括号，字面量可用 0x / 0b / 0o）</label>
        <input
          className="conv-input conv-mono"
          value={expr}
          onChange={(e) => setExpr(e.target.value)}
          placeholder="(1 << 3) | 0xF0"
        />
      </div>

      {exprView && (
        <div className="conv-result-grid">
          <div className="conv-result-row">
            <span className="conv-result-label">十进制</span>
            <span className="conv-result-value">{exprView.dec}</span>
            <CopyButton text={exprView.dec} />
          </div>
          <div className="conv-result-row">
            <span className="conv-result-label">十六进制</span>
            <span className="conv-result-value">{exprView.hex}</span>
            <CopyButton text={exprView.hex} />
          </div>
          <div className="conv-result-row">
            <span className="conv-result-label">二进制</span>
            <span className="conv-result-value">{exprView.bin}</span>
            <CopyButton text={exprView.bin} />
          </div>
        </div>
      )}
      {exprResult?.ok && (
        <div className="conv-toolbar">
          <button className="conv-copy" onClick={useExprResult}>
            填入上方转换区
          </button>
        </div>
      )}
      <ErrorBar error={exprResult && !exprResult.ok ? exprResult.error : null} />
    </ConverterFrame>
  );
}
