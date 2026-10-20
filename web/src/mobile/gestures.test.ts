import { describe, expect, it } from "vitest";
import { classify, LOCK_DISTANCE, PullTracker, PULL_DEFAULTS, swipeLabel, swipeOutcome, SwipeTracker } from "./gestures";

const BOTH = { left: true, right: true };

describe("classify", () => {
  it("waits until the touch has moved a little: a tap stays a tap", () => {
    expect(classify(3, 4, 0, true)).toBe("pending");
    expect(classify(LOCK_DISTANCE - 1, 0, 0, true)).toBe("pending");
  });

  it("sideways on a row is a swipe; sideways elsewhere is left to the browser", () => {
    expect(classify(-30, 5, 200, true)).toBe("swipe");
    expect(classify(30, -8, 0, true)).toBe("swipe");
    expect(classify(30, 5, 0, false)).toBe("scroll");
  });

  it("down at the top of the list is a pull; anywhere else, a scroll", () => {
    expect(classify(2, 30, 0, true)).toBe("pull");
    expect(classify(2, 30, 120, true)).toBe("scroll");
    expect(classify(2, -30, 0, true)).toBe("scroll");
  });

  it("a diagonal leaning vertical is not a swipe", () => {
    expect(classify(20, 19, 300, true)).toBe("scroll");
  });
});

describe("SwipeTracker", () => {
  it("follows the finger and commits past 35% of the width", () => {
    const t = new SwipeTracker(360, BOTH);
    t.start(300, 0);
    expect(t.move(200, 200)).toBe(-100);
    expect(t.armed).toBe(false);
    t.move(170, 400);
    expect(t.direction).toBe("left");
    expect(t.armed).toBe(true);
    expect(t.end()).toBe("left");
  });

  it("springs back when let go early", () => {
    const t = new SwipeTracker(360, BOTH);
    t.start(10, 0);
    t.move(60, 500);
    expect(t.end()).toBeNull();
  });

  it("commits a quick flick that is far enough", () => {
    const t = new SwipeTracker(360, BOTH);
    t.start(10, 0);
    t.move(40, 30);
    t.move(80, 60);
    expect(t.offset).toBe(70);
    expect(t.end()).toBe("right");
  });

  it("a flick back the other way does not commit", () => {
    const t = new SwipeTracker(360, BOTH);
    t.start(10, 0);
    t.move(90, 100);
    t.move(70, 110);
    expect(t.end()).toBeNull();
  });

  it("resists and never commits in a direction with nothing to do", () => {
    const t = new SwipeTracker(360, { left: false, right: true });
    t.start(300, 0);
    expect(t.move(0, 100)).toBe(-50);
    expect(t.armed).toBe(false);
    expect(t.end()).toBeNull();
  });

  it("never moves the row further than its width", () => {
    const t = new SwipeTracker(360, BOTH);
    t.start(0, 0);
    expect(t.move(900, 100)).toBe(360);
  });
});

describe("PullTracker", () => {
  it("moves half the finger, stops at the maximum, refreshes past the threshold", () => {
    const p = new PullTracker();
    p.start(100);
    expect(p.move(180)).toBe(40);
    expect(p.end()).toBe(false);
    expect(p.move(100 + PULL_DEFAULTS.threshold * 2)).toBe(PULL_DEFAULTS.threshold);
    expect(p.end()).toBe(true);
    expect(p.move(1000)).toBe(PULL_DEFAULTS.max);
  });

  it("never goes negative", () => {
    const p = new PullTracker();
    p.start(100);
    expect(p.move(50)).toBe(0);
  });
});

describe("swipeOutcome", () => {
  const inbox = { canArchive: true, deleteForever: false };
  const trash = { canArchive: false, deleteForever: true };

  it("does what the prefs say per direction", () => {
    expect(swipeOutcome("left", { left: "delete", right: "archive" }, inbox)).toBe("delete");
    expect(swipeOutcome("right", { left: "delete", right: "archive" }, inbox)).toBe("archive");
    expect(swipeOutcome("right", { left: "archive", right: "read" }, inbox)).toBe("read");
    expect(swipeOutcome("left", { left: "none", right: "archive" }, inbox)).toBeNull();
  });

  it("has no archive where the list cannot archive (Trash, Spam)", () => {
    expect(swipeOutcome("left", { left: "archive", right: "archive" }, trash)).toBeNull();
    expect(swipeOutcome("left", { left: "delete", right: "archive" }, trash)).toBe("delete");
  });

  it("names the action on the colour behind the row", () => {
    expect(swipeLabel("archive", false, inbox)).toBe("Archive");
    expect(swipeLabel("delete", false, inbox)).toBe("Delete");
    expect(swipeLabel("delete", false, trash)).toBe("Delete forever");
    expect(swipeLabel("read", true, inbox)).toBe("Mark as read");
    expect(swipeLabel("read", false, inbox)).toBe("Mark as unread");
  });
});
