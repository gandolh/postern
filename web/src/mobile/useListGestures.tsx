// Swipe a row to archive or delete, and pull the list down to refresh
// (brief 16). Touch only: a mouse or a keyboard never meets these, and every
// action here is also in the list's toolbar and keys.
//
// ConversationList calls the hook and renders what it returns inside
// .list-body: the colour behind a swiped row and the pull indicator. The
// gesture moves the DOM directly (no React render per frame); the decisions
// are in gestures.ts.
//
// The browser's own pull-to-refresh would reload the page, and a reload signs
// you out (tokens live in memory only), so mobile.css turns it off and this
// one refreshes the list instead.

import type { Id } from "@postern/jmap";
import { Archive, MailOpen, RefreshCw, Trash2 } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { getSwipeActions } from "../prefs/prefs";
import type { SwipeAction } from "../prefs/prefs";
import { PHONE_QUERY } from "../shell/breakpoints";
import { useMediaQuery } from "../shell/useMediaQuery";
import { classify, PULL_DEFAULTS, PullTracker, swipeLabel, swipeOutcome, SwipeTracker, type Direction, type Gesture, type SwipeContext } from "./gestures";
import "./mobile.css";

export interface ListGestureOptions<Row extends { id: Id }> {
  /** The list's scrolling body (.list-body). */
  bodyRef: RefObject<HTMLElement | null>;
  rows: readonly Row[];
  context: SwipeContext;
  isUnread(row: Row): boolean;
  /** Run a swipe's action on a row: the list's own row handlers. */
  act(row: Row, action: Exclude<SwipeAction, "none">): void;
  refresh(): Promise<unknown>;
}

/** How long the row takes to leave or come back. */
const SETTLE_MS = 180;
/** After a swipe, the click the browser may still send is not a tap on the row. */
const CLICK_GUARD_MS = 500;

function reducedMotion(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function settle(el: HTMLElement, transform: string, done?: () => void): void {
  const ms = reducedMotion() ? 0 : SETTLE_MS;
  el.style.transition = ms ? `transform ${ms}ms ease-out` : "none";
  el.style.transform = transform;
  window.setTimeout(() => done?.(), ms);
}

function clearRow(el: HTMLElement): void {
  el.style.transition = "";
  el.style.transform = "";
  delete el.dataset["swiping"];
}

/** Touch gestures for a conversation list on a phone (or any touch screen). Returns what to render in .list-body. */
export function useListGestures<Row extends { id: Id }>(options: ListGestureOptions<Row>): ReactNode {
  const phone = useMediaQuery(PHONE_QUERY);
  const coarse = useMediaQuery("(pointer: coarse)");
  const enabled = phone || coarse;
  const latest = useRef(options);
  useLayoutEffect(() => {
    latest.current = options;
  });
  const backdropRef = useRef<HTMLDivElement>(null);
  const pullRef = useRef<HTMLDivElement>(null);
  const [refreshing, setRefreshing] = useState(false);
  const { bodyRef } = options;

  useEffect(() => {
    const body = bodyRef.current;
    if (!enabled || !body) return;

    let gesture: Gesture = "pending";
    let x0 = 0;
    let y0 = 0;
    let row: { el: HTMLElement; id: Id } | null = null;
    let swipe: SwipeTracker | null = null;
    let pull: PullTracker | null = null;
    let busy = false;
    let guardUntil = 0;

    const backdrop = () => backdropRef.current;
    const indicator = () => pullRef.current;

    const showBackdrop = (el: HTMLElement) => {
      const b = backdrop();
      if (!b) return;
      const r = el.getBoundingClientRect();
      const top = r.top - body.getBoundingClientRect().top + body.scrollTop;
      b.style.top = `${top}px`;
      b.style.height = `${r.height}px`;
      b.hidden = false;
    };

    const paintBackdrop = (direction: Direction | null, armed: boolean) => {
      const b = backdrop();
      const current = row && latest.current.rows.find((r) => r.id === row?.id);
      if (!b || !direction || !current) return;
      const { context, isUnread } = latest.current;
      const action = swipeOutcome(direction, getSwipeActions(), context);
      b.dataset["direction"] = direction;
      b.dataset["action"] = action ?? "none";
      b.dataset["armed"] = armed ? "true" : "false";
      const label = b.querySelector<HTMLElement>(".mobile-swipe-label");
      if (label) label.textContent = action ? swipeLabel(action, isUnread(current), context) : "";
    };

    const hideBackdrop = () => {
      const b = backdrop();
      if (b) b.hidden = true;
    };

    const paintPull = (distance: number, armed: boolean) => {
      const p = indicator();
      if (!p) return;
      p.hidden = distance <= 0;
      p.style.transform = `translate(-50%, ${distance - 48}px) rotate(${distance * 3}deg)`;
      p.dataset["armed"] = armed ? "true" : "false";
    };

    const reset = () => {
      gesture = "pending";
      row = null;
      swipe = null;
      pull = null;
    };

    const onStart = (event: TouchEvent) => {
      if (busy || event.touches.length !== 1) {
        reset();
        return;
      }
      const touch = event.touches[0]!;
      x0 = touch.clientX;
      y0 = touch.clientY;
      gesture = "pending";
      const el = (event.target as Element | null)?.closest<HTMLElement>("[data-row-id]");
      row = el && body.contains(el) && el.dataset["rowId"] ? { el, id: el.dataset["rowId"] } : null;
    };

    const onMove = (event: TouchEvent) => {
      if (event.touches.length !== 1 || gesture === "scroll") return;
      const touch = event.touches[0]!;
      const dx = touch.clientX - x0;
      const dy = touch.clientY - y0;
      if (gesture === "pending") {
        gesture = classify(dx, dy, body.scrollTop, row !== null);
        if (gesture === "swipe" && row) {
          const actions = getSwipeActions();
          const { context } = latest.current;
          swipe = new SwipeTracker(row.el.getBoundingClientRect().width, {
            left: swipeOutcome("left", actions, context) !== null,
            right: swipeOutcome("right", actions, context) !== null,
          });
          swipe.start(x0, event.timeStamp);
          row.el.dataset["swiping"] = "true";
          row.el.style.transition = "none";
          showBackdrop(row.el);
        } else if (gesture === "pull") {
          pull = new PullTracker();
          pull.start(y0);
        } else if (gesture !== "pending") {
          return;
        }
      }
      if (gesture === "swipe" && swipe && row) {
        event.preventDefault();
        const offset = swipe.move(touch.clientX, event.timeStamp);
        row.el.style.transform = `translate3d(${offset}px, 0, 0)`;
        paintBackdrop(swipe.direction, swipe.armed);
      } else if (gesture === "pull" && pull) {
        event.preventDefault();
        const distance = pull.move(touch.clientY);
        paintPull(distance, pull.armed);
      }
    };

    const endSwipe = (commit: boolean) => {
      if (!swipe || !row) return;
      const { el, id } = row;
      const direction = commit ? swipe.end() : null;
      const current = latest.current.rows.find((r) => r.id === id);
      const action = direction ? swipeOutcome(direction, getSwipeActions(), latest.current.context) : null;
      guardUntil = Date.now() + CLICK_GUARD_MS;
      if (!direction || !action || !current) {
        settle(el, "translate3d(0, 0, 0)", () => {
          clearRow(el);
          hideBackdrop();
        });
        return;
      }
      busy = true;
      const width = el.getBoundingClientRect().width;
      settle(el, `translate3d(${direction === "left" ? -width : width}px, 0, 0)`, () => {
        latest.current.act(current, action);
        // Archive and delete hide the row; if it is still here (read/unread,
        // a confirm dialog, an error), it slides back.
        window.setTimeout(
          () => {
            busy = false;
            if (!el.isConnected) {
              hideBackdrop();
              return;
            }
            settle(el, "translate3d(0, 0, 0)", () => {
              clearRow(el);
              hideBackdrop();
            });
          },
          action === "read" ? 0 : 400,
        );
      });
    };

    const endPull = (commit: boolean) => {
      if (!pull) return;
      const refresh = commit && pull.end();
      if (!refresh) {
        paintPull(0, false);
        return;
      }
      busy = true;
      setRefreshing(true);
      paintPull(PULL_DEFAULTS.threshold, true);
      void latest.current
        .refresh()
        .catch(() => undefined)
        .finally(() => {
          busy = false;
          setRefreshing(false);
          paintPull(0, false);
        });
    };

    const onEnd = () => {
      if (gesture === "swipe") endSwipe(true);
      else if (gesture === "pull") endPull(true);
      reset();
    };

    const onCancel = () => {
      if (gesture === "swipe") endSwipe(false);
      else if (gesture === "pull") endPull(false);
      reset();
    };

    const onClick = (event: MouseEvent) => {
      if (Date.now() < guardUntil) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    body.addEventListener("touchstart", onStart, { passive: true });
    body.addEventListener("touchmove", onMove, { passive: false });
    body.addEventListener("touchend", onEnd);
    body.addEventListener("touchcancel", onCancel);
    body.addEventListener("click", onClick, true);
    return () => {
      body.removeEventListener("touchstart", onStart);
      body.removeEventListener("touchmove", onMove);
      body.removeEventListener("touchend", onEnd);
      body.removeEventListener("touchcancel", onCancel);
      body.removeEventListener("click", onClick, true);
      if (row) clearRow(row.el);
    };
  }, [enabled, bodyRef]);

  if (!enabled) return null;
  return (
    <>
      <div ref={backdropRef} className="mobile-swipe-backdrop" aria-hidden="true" hidden>
        <span className="mobile-swipe-cue">
          <Archive className="mobile-swipe-icon" data-for="archive" />
          <Trash2 className="mobile-swipe-icon" data-for="delete" />
          <MailOpen className="mobile-swipe-icon" data-for="read" />
          <span className="mobile-swipe-label" />
        </span>
      </div>
      <div ref={pullRef} className="mobile-pull" aria-hidden="true" hidden>
        <RefreshCw />
      </div>
      <div className="visually-hidden" role="status">
        {refreshing ? "Refreshing conversations" : ""}
      </div>
    </>
  );
}
