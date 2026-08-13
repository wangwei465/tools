"use client";

interface Props {
  leftHash: string | null;
  rightHash: string | null;
  /** null 表示尚未计算（有侧内容非法或为空） */
  isEqual: boolean | null;
}

/**
 * 展示左右两侧 hash 值与一致性结论。
 * 纯展示组件，不含任何计算逻辑（hash 由上层计算后传入）。
 */
export function HashPanel({ leftHash, rightHash, isEqual }: Props) {
  return (
    <div className="hash-panel">
      <div className="hash-row">
        <HashItem label="左侧 SHA-256" hash={leftHash} />
        <div className="hash-verdict">
          {isEqual === null ? (
            <span className="verdict-pending">— 等待输入 —</span>
          ) : isEqual ? (
            <span className="verdict-equal">✓ 完全一致</span>
          ) : (
            <span className="verdict-diff">✗ 不一致</span>
          )}
        </div>
        <HashItem label="右侧 SHA-256" hash={rightHash} align="right" />
      </div>
    </div>
  );
}

function HashItem({
  label,
  hash,
  align,
}: {
  label: string;
  hash: string | null;
  align?: "right";
}) {
  return (
    <div className={`hash-item${align ? " align-right" : ""}`}>
      <div className="hash-label">{label}</div>
      {hash ? (
        <div className="hash-value">{hash}</div>
      ) : (
        <div className="hash-value empty">未计算</div>
      )}
    </div>
  );
}
