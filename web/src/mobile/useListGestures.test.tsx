// @vitest-environment jsdom
// The list gestures end to end in the DOM: synthetic touch events on a fake
// list body, the row moves, release acts through the list's handlers.

import { act, cleanup, render } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetPrefs, setPrefs, setPrefsAccount } from "../prefs/prefs";
import { clearMemory } from "../prefs/storage";
import { useListGestures, type ListGestureOptions } from "./useListGestures";

interface Row {
  id: string;
}

const ROWS: Row[] = [{ id: "T1" }, { id: "T2" }];

function Harness(props: Omit<ListGestureOptions<Row>, "bodyRef">) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const layer = useListGestures({ ...props, bodyRef });
  return (
    <div ref={bodyRef} className="list-body" data-testid="body">
      {layer}
      {ROWS.map((r) => (
        <div key={r.id} role="row" data-row-id={r.id} onClick={() => props.act(r, "read")}>
          <span>{r.id}</span>
        </div>
      ))}
    </div>
  );
}

function touch(el: Element, type: string, x: number, y: number, t: number) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  const point = { clientX: x, clientY: y, identifier: 1, target: el };
  Object.defineProperty(event, "touches", { value: type === "touchend" || type === "touchcancel" ? [] : [point] });
  Object.defineProperty(event, "timeStamp", { value: t });
  el.dispatchEvent(event);
  return event;
}

function rowEl(id: string): HTMLElement {
  return document.querySelector<HTMLElement>(`[data-row-id="${id}"]`)!;
}

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  clearMemory();
  resetPrefs();
  setPrefsAccount("alice@postern.test");
  // A phone: PHONE_QUERY matches; no reduced motion.
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("max-width"), addEventListener() {}, removeEventListener() {} }));
  // jsdom lays nothing out: give rows a width.
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ x: 0, y: 0, top: 0, left: 0, right: 360, bottom: 80, width: 360, height: 80, toJSON() {} } as DOMRect);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  resetPrefs();
});

function setup() {
  const actFn = vi.fn();
  const refresh = vi.fn(async () => {});
  render(<Harness rows={ROWS} context={{ canArchive: true, deleteForever: false }} isUnread={() => true} act={actFn} refresh={refresh} />);
  return { actFn, refresh };
}

describe("swipe a row", () => {
  it("archives on a long swipe left (the default), moving the row with the finger", async () => {
    const { actFn } = setup();
    const row = rowEl("T1");
    touch(row, "touchstart", 300, 40, 0);
    const move = touch(row, "touchmove", 280, 42, 16);
    expect(move.defaultPrevented).toBe(true);
    touch(row, "touchmove", 150, 42, 200);
    expect(row.style.transform).toBe("translate3d(-150px, 0, 0)");
    const backdrop = document.querySelector<HTMLElement>(".mobile-swipe-backdrop")!;
    expect(backdrop.hidden).toBe(false);
    expect(backdrop.dataset["action"]).toBe("archive");
    expect(backdrop.dataset["armed"]).toBe("true");
    expect(backdrop.textContent).toContain("Archive");
    touch(row, "touchend", 150, 42, 210);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    expect(actFn).toHaveBeenCalledWith(ROWS[0], "archive");
  });

  it("uses the device's choice per direction", async () => {
    setPrefs({ swipeRight: "delete" });
    const { actFn } = setup();
    const row = rowEl("T2");
    touch(row, "touchstart", 20, 40, 0);
    touch(row, "touchmove", 40, 40, 16);
    touch(row, "touchmove", 250, 40, 300);
    touch(row, "touchend", 250, 40, 310);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    expect(actFn).toHaveBeenCalledWith(ROWS[1], "delete");
  });

  it("springs back on a short swipe and swallows the click that follows", async () => {
    const { actFn } = setup();
    const row = rowEl("T1");
    touch(row, "touchstart", 300, 40, 0);
    touch(row, "touchmove", 280, 40, 16);
    touch(row, "touchmove", 260, 40, 600);
    touch(row, "touchend", 260, 40, 610);
    row.click();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    expect(actFn).not.toHaveBeenCalled();
    expect(row.style.transform).toBe("");
  });

  it("leaves a vertical move to the browser's scroll", () => {
    const { actFn } = setup();
    const body = document.querySelector<HTMLElement>(".list-body")!;
    body.scrollTop = 200;
    const row = rowEl("T1");
    touch(row, "touchstart", 100, 300, 0);
    const move = touch(row, "touchmove", 102, 250, 16);
    expect(move.defaultPrevented).toBe(false);
    touch(row, "touchmove", 104, 100, 32);
    expect(row.style.transform).toBe("");
    touch(row, "touchend", 104, 100, 40);
    expect(actFn).not.toHaveBeenCalled();
  });

  it("does nothing when that direction is set to Nothing", async () => {
    setPrefs({ swipeLeft: "none" });
    const { actFn } = setup();
    const row = rowEl("T1");
    touch(row, "touchstart", 300, 40, 0);
    touch(row, "touchmove", 280, 40, 16);
    touch(row, "touchmove", 20, 40, 300);
    touch(row, "touchend", 20, 40, 310);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    expect(actFn).not.toHaveBeenCalled();
  });
});

describe("pull to refresh", () => {
  it("refreshes the list when pulled far enough at the top", async () => {
    const { refresh } = setup();
    const row = rowEl("T1");
    touch(row, "touchstart", 100, 50, 0);
    const move = touch(row, "touchmove", 100, 70, 16);
    expect(move.defaultPrevented).toBe(true);
    touch(row, "touchmove", 100, 250, 300);
    const indicator = document.querySelector<HTMLElement>(".mobile-pull")!;
    expect(indicator.hidden).toBe(false);
    expect(indicator.dataset["armed"]).toBe("true");
    await act(async () => {
      touch(row, "touchend", 100, 250, 310);
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(indicator.hidden).toBe(true);
  });

  it("does not refresh on a short pull", () => {
    const { refresh } = setup();
    const row = rowEl("T1");
    touch(row, "touchstart", 100, 50, 0);
    touch(row, "touchmove", 100, 70, 16);
    touch(row, "touchmove", 100, 110, 100);
    touch(row, "touchend", 100, 110, 110);
    expect(refresh).not.toHaveBeenCalled();
  });
});
