"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** 短暂操作反馈：设置一条消息并在 duration 后自动清除，卸载时清理定时器。 */
export function useFlash(duration = 1200): [string | null, (msg: string) => void] {
  const [msg, setMsg] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  const flash = useCallback(
    (m: string) => {
      setMsg(m);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setMsg(null), duration);
    },
    [duration],
  );

  useEffect(() => () => clearTimeout(timer.current), []);

  return [msg, flash];
}
