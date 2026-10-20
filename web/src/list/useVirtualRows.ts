// A fixed-height window over a long list: only the rows in view (plus a
// margin) are rendered. Every row is exactly `--row-height` tall, measured
// from a probe element so it follows the density setting.

import { useCallback, useLayoutEffect, useState, type RefObject } from "react";
import { useDisplaySettings } from "../theme";

export interface VirtualRows {
  /** The row height in px. */
  rowHeight: number;
  /** Rows to render: [start, end). */
  start: number;
  end: number;
  /** Rows actually in view: [first, last). */
  first: number;
  last: number;
  totalHeight: number;
  /** Scroll the least needed to show a row. */
  scrollToIndex(index: number): void;
}

/** Without layout (tests, first paint) assume a screenful. */
const FALLBACK_VIEWPORT = 800;
const FALLBACK_ROW = 48;

export function useVirtualRows(
  scrollRef: RefObject<HTMLElement | null>,
  probeRef: RefObject<HTMLElement | null>,
  count: number,
  overscan = 8,
): VirtualRows {
  const { density } = useDisplaySettings();
  const [rowHeight, setRowHeight] = useState(FALLBACK_ROW);
  const [viewport, setViewport] = useState({ top: 0, height: 0 });

  useLayoutEffect(() => {
    const measure = () => {
      const h = probeRef.current?.getBoundingClientRect().height ?? 0;
      if (h > 0) setRowHeight(h);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [probeRef, density]);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => setViewport((v) => (v.top === el.scrollTop && v.height === el.clientHeight ? v : { top: el.scrollTop, height: el.clientHeight }));
    update();
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        update();
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(el);
    return () => {
      el.removeEventListener("scroll", onScroll);
      observer?.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [scrollRef]);

  const height = viewport.height || FALLBACK_VIEWPORT;
  const first = Math.min(count, Math.max(0, Math.floor(viewport.top / rowHeight)));
  const last = Math.min(count, Math.ceil((viewport.top + height) / rowHeight));
  const start = Math.max(0, first - overscan);
  const end = Math.min(count, last + overscan);

  const scrollToIndex = useCallback(
    (index: number) => {
      const el = scrollRef.current;
      if (!el) return;
      const top = index * rowHeight;
      if (top < el.scrollTop) el.scrollTop = top;
      else if (top + rowHeight > el.scrollTop + el.clientHeight) el.scrollTop = top + rowHeight - el.clientHeight;
    },
    [scrollRef, rowHeight],
  );

  return { rowHeight, start, end, first, last, totalHeight: count * rowHeight, scrollToIndex };
}
