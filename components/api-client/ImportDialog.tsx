"use client";

import { useState } from "react";
import { parseCurl, CurlParseError } from "./curl";
import type { RequestDraft } from "./types";

interface Props {
  /** 载入解析结果到新 tab（不覆盖当前 tab）。 */
  onImport: (draft: RequestDraft) => void;
  onClose: () => void;
}

/** cURL 导入弹窗：粘贴 → 解析 → 载入新 tab；提示未识别选项与解析错误。 */
export function ImportDialog({ onImport, onClose }: Props) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [unknown, setUnknown] = useState<string[]>([]);
  const [done, setDone] = useState(false);

  const doImport = () => {
    setError(null);
    setUnknown([]);
    setDone(false);
    try {
      const { draft, unknownOptions } = parseCurl(text);
      onImport(draft); // 载入新 tab（成功才动，畸形时当前 tab 不受影响）
      if (unknownOptions.length > 0) {
        setUnknown(unknownOptions);
        setDone(true); // 停留展示忽略提示
      } else {
        onClose();
      }
    } catch (e) {
      setError(e instanceof CurlParseError ? e.message : "解析失败：无法识别的 cURL 命令");
    }
  };

  return (
    <div className="apic-modal-mask" onClick={onClose}>
      <div className="apic-modal apic-import" onClick={(e) => e.stopPropagation()}>
        <div className="apic-modal-title">导入 cURL</div>

        {done ? (
          <div className="apic-import-msg apic-import-ok">
            ✓ 已导入到新标签页。
            {unknown.length > 0 && (
              <>
                <br />
                已忽略未识别选项：{unknown.join("、")}
              </>
            )}
          </div>
        ) : (
          <>
            <textarea
              className="apic-import-input"
              value={text}
              placeholder={"粘贴 cURL 命令，例如：\ncurl -X POST 'https://api.example.com/users' \\\n  -H 'Content-Type: application/json' \\\n  -d '{\"name\":\"foo\"}'"}
              onChange={(e) => setText(e.target.value)}
              autoFocus
              spellCheck={false}
            />
            {error && <div className="apic-import-msg apic-import-err">⚠ {error}</div>}
          </>
        )}

        <div className="apic-modal-actions">
          {done ? (
            <button className="apic-btn-primary" onClick={onClose}>
              完成
            </button>
          ) : (
            <>
              <button className="apic-btn-ghost" onClick={onClose}>
                取消
              </button>
              <button className="apic-btn-primary" onClick={doImport} disabled={!text.trim()}>
                导入
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
