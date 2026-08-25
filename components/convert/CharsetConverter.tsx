"use client";

import { useMemo, useState } from "react";
import {
  inspectChars,
  restoreMojibake,
  decodeHexBytes,
  DECODE_ENCODINGS,
  MAX_CHARS,
  RestoreResult,
} from "@/lib/convert/charset";
import { ConvertResult } from "@/lib/convert/result";
import { CopyButton, ErrorBar, ConverterFrame } from "./shared";

/**
 * 字符编码排查与乱码还原。
 *
 * 还原不做实时计算：首次触发要构建约 2.4 万项的编码反查表，挂在 onChange 上
 * 会让每次按键都重算，故由按钮显式触发。
 */
export function CharsetConverter() {
  const [text, setText] = useState("");
  const [restore, setRestore] = useState<ConvertResult<RestoreResult> | null>(null);
  const [hex, setHex] = useState("");
  const [hexEncoding, setHexEncoding] = useState<string>("gbk");

  const view = useMemo(() => (text ? inspectChars(text) : null), [text]);
  const hexResult = useMemo(
    () => (hex.trim() ? decodeHexBytes(hex, hexEncoding) : null),
    [hex, hexEncoding]
  );

  const joinCol = (pick: (c: { utf8: string; escapeU: string; percent: string; htmlEntity: string }) => string) =>
    view ? view.chars.map(pick).join("") : "";

  return (
    <ConverterFrame
      title="字符编码排查"
      desc="逐字符查看编码表示，并尝试还原被错误解码的乱码。全部在本地计算。"
    >
      <div className="conv-field">
        <label className="conv-io-label">文本</label>
        <textarea
          className="conv-textarea"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setRestore(null);
          }}
          placeholder="粘贴文本或乱码，如：涓枃"
          style={{ minHeight: 80 }}
        />
      </div>

      {view && (
        <>
          <div className="conv-toolbar">
            <span className="conv-io-label">共 {view.total} 个字符</span>
            <div className="conv-toolbar-actions">
              <CopyButton text={joinCol((c) => c.utf8 + " ")} label="复制 UTF-8 字节" />
              <CopyButton text={joinCol((c) => c.escapeU)} label="复制 \u 转义" />
              <CopyButton text={joinCol((c) => c.percent)} label="复制 %XX" />
              <CopyButton text={joinCol((c) => c.htmlEntity)} label="复制 HTML 实体" />
            </div>
          </div>

          {view.truncated && (
            <div className="conv-notice">
              文本过长，逐字符视图仅展示前 {MAX_CHARS} 个字符。
            </div>
          )}

          <div className="conv-char-table-wrap">
            <table className="conv-char-table">
              <thead>
                <tr>
                  <th>字符</th>
                  <th>码位</th>
                  <th>UTF-8</th>
                  <th>UTF-16</th>
                  <th>Latin-1</th>
                  <th>\u 转义</th>
                  <th>%XX</th>
                  <th>HTML 实体</th>
                </tr>
              </thead>
              <tbody>
                {view.chars.map((c, i) => (
                  <tr key={`${c.codePoint}-${i}`}>
                    <td className="conv-char-cell">{c.char}</td>
                    <td>{c.codePointHex}</td>
                    <td>{c.utf8}</td>
                    <td>{c.utf16}</td>
                    <td>{c.latin1}</td>
                    <td>{c.escapeU}</td>
                    <td>{c.percent}</td>
                    <td>{c.htmlEntity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* 乱码还原 */}
      <div className="conv-toolbar">
        <button className="conv-btn-primary" onClick={() => setRestore(restoreMojibake(text))} disabled={!text.trim()}>
          尝试还原乱码
        </button>
        <span className="conv-frame-desc">枚举常见的编码误读组合，按可信度排序。</span>
      </div>

      {restore?.ok && (
        <div className="conv-field">
          {restore.value!.inputLossy && (
            <div className="conv-notice">
              <strong>输入中含替换字符 U+FFFD</strong>
              ：这部分信息在产生乱码时就已丢失，任何候选都无法完整还原。
            </div>
          )}
          {restore.value!.skipped.length > 0 && (
            <div className="conv-notice">
              当前环境不支持编码 {restore.value!.skipped.join(" / ")}，已跳过对应候选。
            </div>
          )}
          <div className="conv-restore-list">
            {restore.value!.candidates.map((c, i) => (
              <div className="conv-restore-item" key={`${c.label}-${i}`}>
                <div className="conv-restore-head">
                  <span className="conv-restore-label">{c.label}</span>
                  <span className="conv-restore-score">可信度 {c.score}</span>
                  {c.lossy && <span className="conv-restore-lossy">不可逆</span>}
                  <CopyButton text={c.text} />
                </div>
                <div className="conv-restore-text conv-mono">{c.text}</div>
              </div>
            ))}
          </div>
        </div>
      )}
      <ErrorBar error={restore && !restore.ok ? restore.error : null} />

      {/* 十六进制字节解码 */}
      <div className="conv-field">
        <div className="conv-io-labelrow">
          <label className="conv-io-label">十六进制字节 → 文本</label>
          <select
            className="conv-input conv-input-sm"
            style={{ width: 120 }}
            value={hexEncoding}
            onChange={(e) => setHexEncoding(e.target.value)}
          >
            {DECODE_ENCODINGS.map((enc) => (
              <option key={enc} value={enc}>
                {enc}
              </option>
            ))}
          </select>
        </div>
        <input
          className="conv-input conv-mono"
          value={hex}
          onChange={(e) => setHex(e.target.value)}
          placeholder="D6 D0 CE C4"
        />
      </div>

      {hexResult?.ok && (
        <div className="conv-result-grid">
          <div className="conv-result-row">
            <span className="conv-result-label">解码结果</span>
            <span className="conv-result-value">{hexResult.value}</span>
            <CopyButton text={hexResult.value!} />
          </div>
        </div>
      )}
      <ErrorBar error={hexResult && !hexResult.ok ? hexResult.error : null} />
    </ConverterFrame>
  );
}
