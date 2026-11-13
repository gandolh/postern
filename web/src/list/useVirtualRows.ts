// A window over a long list: only the rows in view (plus a margin) are rendered. A row is at least `--row-height`
// tall, measured from a probe element so it follows the density, and a long subject makes it taller, so every
// rendered row is measured and the rows' offsets are the sum of what is known (the probe's height for the rest).

import { useCallback, useLayoutEffect, useMemo, useState, type RefObject } from "react";
import { useDisplaySettings } from "../theme";

export interface VirtualRows {
  /** The estimated row height in px (the probe's). */
  rowHeight: number;
  /** Rows to render: [start, end). */
  start: number;
  end: number;
  /** Rows actually in view: [first, last). */
  first: number;
  last: number;
  totalHeight: number;
  /** Where row `start` begins, for the translateY of the rendered group. */
  startOffset: number;
  /** Scroll the least needed to show a row. */
  scrollToIndex(index: number): void;
}

/** Without layout (tests, first paint) assume a screenful. */
const FALLBACK_VIEWPORT = 800;
const FALLBACK_ROW = 48;

/** The first index whose row ends below `y` (offsets has count + 1 entries). */
function indexAt(offsets: readonly number[], y: number): number {
  let lo = 0;
  let hi = offsets.length - 2;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((offsets[mid + 1] as number) <= y) lo = mid + 1;
    else hi = mid;
  }
  return Math.max(0, lo);
}

export function useVirtualRows(
  scrollRef: RefObject<HTMLElement | null>,
  probeRef: RefObject<HTMLElement | null>,
  /** The rendered rows' container: its children carry `aria-rowindex`, and each is measured. */
  groupRef: RefObject<HTMLElement | null>,
  count: number,
  overscan = 8,
): VirtualRows {
  const { density } = useDisplaySettings();
  const [rowHeight, setRowHeight] = useState(FALLBACK_ROW);
  const [viewport, setViewport] = useState({ top: 0, height: 0 });
  const [heights, setHeights] = useState<ReadonlyMap<number, number>>(() => new Map());

  useLayoutEffect(() => {
    const measure = () => {
      const h = probeRef.current?.getBoundingClientRect().height ?? 0;
      if (h > 0) setRowHeight(h);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [probeRef, density]);

  // A new density or width changes what a row's text wraps to: forget what was measured.
  useLayoutEffect(() => setHeights(new Map()), [density]);

  // Measure the rendered rows after every render, and again when the list's width (hence the wrapping) changes.
  useLayoutEffect(() => {
    const group = groupRef.current;
    if (!group) return;
    const measure = () => {
      let next: Map<number, number> | null = null;
      for (const child of Array.from(group.children)) {
        const index = Number((child as HTMLElement).getAttribute("aria-rowindex")) - 1;
        const h = (child as HTMLElement).getBoundingClientRect().height;
        if (!(index >= 0) || !(h > 0)) continue;
        if (Math.abs((heights.get(index) ?? -1) - h) < 0.5) continue;
        next ??= new Map(heights);
        next.set(index, h);
      }
      if (next) setHeights(next);
    };
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(group);
    return () => observer?.disconnect();
  });

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () =>
      setViewport((v) =>
        v.top === el.scrollTop && v.height === el.clientHeight ? v : { top: el.scrollTop, height: el.clientHeight },
      );
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

  const offsets = useMemo(() => {
    const out: number[] = new Array<number>(count + 1);
    let y = 0;
    for (let i = 0; i < count; i++) {
      out[i] = y;
      y += heights.get(i) ?? rowHeight;
    }
    out[count] = y;
    return out;
  }, [count, heights, rowHeight]);

  const height = viewport.height || FALLBACK_VIEWPORT;
  const first = count === 0 ? 0 : Math.min(count, indexAt(offsets, viewport.top));
  const last = count === 0 ? 0 : Math.min(count, indexAt(offsets, viewport.top + height) + 1);
  const start = Math.max(0, first - overscan);
  const end = Math.min(count, last + overscan);

  const scrollToIndex = useCallback(
    (index: number) => {
      const el = scrollRef.current;
      if (!el) return;
      const top = offsets[Math.min(index, count)] ?? 0;
      const bottom = offsets[Math.min(index + 1, count)] ?? top;
      if (top < el.scrollTop) el.scrollTop = top;
      else if (bottom > el.scrollTop + el.clientHeight) el.scrollTop = bottom - el.clientHeight;
    },
    [scrollRef, offsets, count],
  );

  return {
    rowHeight,
    start,
    end,
    first,
    last,
    totalHeight: offsets[count] ?? 0,
    startOffset: offsets[start] ?? 0,
    scrollToIndex,
  };
}
