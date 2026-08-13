"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

/**
 * 工作台请求区与响应区的高度拖动。
 *
 * 只受控请求区一侧，响应区维持 flex: 1 自动吃掉剩余空间——两侧都受控就得保证
 * 「两者之和恒等于容器高度」，窗口缩放时容易累积误差或出现裂缝。
 *
 * 拖动用 Pointer Events + setPointerCapture：指针移出分隔条甚至移出窗口时事件仍可靠
 * 送达，无需在 document 上挂全局监听再手工清理，且天然支持触控。
 */

const STORAGE_KEY = "apic:request-pane-height";

/** 请求区下界：保证参数页签与至少一行内容可见 */
const MIN_REQUEST = 120;
/** 响应区下界：保证状态行与视图页签可见 */
const MIN_RESPONSE = 160;
/** 默认高度：与改造前 max-height: 34vh 的观感接近 */
const DEFAULT_HEIGHT = 260;

/** 把高度钳制在 [MIN_REQUEST, upper] 内；upper 由 measure() 依当前布局实测反推。 */
function clampHeight(h: number, upper: number): number {
  return Math.min(Math.max(Math.round(h), MIN_REQUEST), Math.max(MIN_REQUEST, upper));
}

export function useSplitHeight() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const paneRef = useRef<HTMLDivElement | null>(null);
  const splitterRef = useRef<HTMLDivElement | null>(null);
  const dragging = useRef(false);
  /** 分隔条与上下间隙的固定开销，正常布局下反推一次后长期复用 */
  const chromeRef = useRef(0);
  const [height, setHeight] = useState(DEFAULT_HEIGHT);

  /**
   * 当前布局度量：请求区顶部坐标，以及请求区高度的上界。
   *
   * available（请求区顶部到容器底部）不随请求区高度变化，可直接作为分配总量。
   * 需从中扣除分隔条连同上下间隙的固定开销 chrome——它们 flex-shrink 为 0、不参与压缩，
   * 故在正常布局下反推一次即长期有效，用 ref 缓存。
   *
   * 之所以缓存而非每次反推：窗口骤然缩小时响应区会被压扁、请求区可能溢出容器，
   * 此刻反推得到的是负值，据此计算上界会让响应区继续塌陷。
   *
   * 响应区经类名查询而非 ref 获取——ResponsePane 自身渲染 .apic-response，
   * 传 ref 进去要改其对外接口，而本 hook 本就是为这套固定布局服务的。
   */
  const measure = useCallback((): { paneTop: number; upper: number } | null => {
    const pane = paneRef.current;
    const container = containerRef.current;
    if (!pane || !container) return null;

    const paneRect = pane.getBoundingClientRect();
    const available = container.getBoundingClientRect().bottom - paneRect.top;
    const responseEl = container.querySelector<HTMLElement>(".apic-response");
    const respHeight = responseEl?.getBoundingClientRect().height ?? 0;

    const probed = available - paneRect.height - respHeight;
    if (probed > 0) chromeRef.current = probed;

    return { paneTop: paneRect.top, upper: available - MIN_RESPONSE - chromeRef.current };
  }, []);

  // 读取持久化高度。localStorage 只能在客户端访问，故置于 effect 内避免 hydration 不匹配。
  useEffect(() => {
    let stored: number | null = null;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const n = raw == null ? NaN : Number(raw);
      if (Number.isFinite(n) && n > 0) stored = n;
    } catch {
      // 存储不可用时保持默认高度——持久化是增强项，不应阻断渲染
    }
    const m = measure();
    // 越界或损坏的值同样走钳制，不直接采信
    setHeight(clampHeight(stored ?? DEFAULT_HEIGHT, m?.upper ?? Infinity));
  }, [measure]);

  // 窗口尺寸变化后重新钳制，避免小窗口下某一区被压没
  useEffect(() => {
    const onResize = () => {
      const m = measure();
      if (m) setHeight((h) => clampHeight(h, m.upper));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [measure]);

  const onPointerDown = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragging.current = true;
  }, []);

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!dragging.current) return;
      const m = measure();
      if (!m) return;
      setHeight(clampHeight(e.clientY - m.paneTop, m.upper));
    },
    [measure],
  );

  const onPointerUp = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    dragging.current = false;
    e.currentTarget.releasePointerCapture(e.pointerId);
    // 存拖动结束时的实际高度，避免拖动过程中频繁写入
    const actual = paneRef.current?.getBoundingClientRect().height;
    if (actual) {
      try {
        localStorage.setItem(STORAGE_KEY, String(Math.round(actual)));
      } catch {
        // 存储不可用时静默忽略，本次调整仍在当前会话内生效
      }
    }
  }, []);

  return { containerRef, paneRef, splitterRef, height, onPointerDown, onPointerMove, onPointerUp };
}
