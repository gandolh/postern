// A message's HTML on screen: the sanitised document in a sandboxed
// <iframe srcdoc>, sized by estimate (render/measure.ts) since neither side
// can read the other. The estimate leans tall and is capped near the
// viewport's height; past the cap the frame scrolls inside, and "Show full
// message" lifts the cap. The frame's edge can also be dragged.

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { estimateFrameHeight } from "../render/measure";
import type { SanitizedHtml } from "../render/sanitize";
import { buildSrcdoc, MESSAGE_FRAME_SANDBOX } from "../render/srcdoc";

export interface MessageFrameProps {
  clean: SanitizedHtml;
  foldQuote: boolean;
  theme: "light" | "dark";
  allowRemote: boolean;
  /** The frame's accessible name: "Message from Bob Baker". */
  title: string;
}

function subscribeViewport(listener: () => void): () => void {
  window.addEventListener("resize", listener);
  return () => window.removeEventListener("resize", listener);
}

const viewportHeight = () => window.innerHeight;

/** The tallest a frame grows before it scrolls inside, unless the reader asks for all of it. */
export function frameCap(viewport: number): number {
  return Math.max(480, Math.round(viewport * 1.5));
}

export function MessageFrame({ clean, foldQuote, theme, allowRemote, title }: MessageFrameProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [full, setFull] = useState(false);
  const viewport = useSyncExternalStore(subscribeViewport, viewportHeight, () => 800);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    if (typeof ResizeObserver === "undefined") {
      setWidth(Math.round(el.clientWidth));
      return;
    }
    const observer = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      // Re-estimate only for real width changes (not every pixel of a drag).
      setWidth((prev) => (Math.abs(prev - w) >= 8 ? Math.round(w) : prev));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const estimate = useMemo(() => (width > 0 ? estimateFrameHeight(clean.body, { width, foldQuote }) : 160), [clean, width, foldQuote]);
  const cap = frameCap(viewport);
  const capped = !full && estimate > cap;
  const height = capped ? cap : estimate;
  const srcdoc = useMemo(() => buildSrcdoc(clean, { foldQuote, theme, allowRemote }), [clean, foldQuote, theme, allowRemote]);

  return (
    <>
      <div ref={wrapRef} className="conv-frame-wrap" style={{ height }}>
        <iframe className="conv-frame" sandbox={MESSAGE_FRAME_SANDBOX} srcDoc={srcdoc} title={title} referrerPolicy="no-referrer" />
      </div>
      {capped ? (
        <button type="button" className="btn btn-quiet conv-frame-more" onClick={() => setFull(true)}>
          Show full message
        </button>
      ) : null}
    </>
  );
}
