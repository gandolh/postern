// Touch gestures on the conversation list (brief 16), as pure logic so they
// can be tested without a screen. useListGestures.tsx feeds them touch points
// and moves the DOM.
//
//   classify()       after the first few pixels: a row swipe, a pull to refresh, or the page's own scroll
//   SwipeTracker     a horizontal swipe on a row: offset, and whether release commits it
//   PullTracker      a pull down at the top of the list: distance, and whether release refreshes
//   swipeOutcome()   what a swipe does in this list, from the per-device prefs

import type { SwipeAction } from "../prefs/prefs";

export type Direction = "left" | "right";
export type Gesture = "pending" | "swipe" | "pull" | "scroll";

/** Movement before a gesture is decided. Below it a touch is still a tap. */
export const LOCK_DISTANCE = 10;

/**
 * Decide what a touch is, once it has moved LOCK_DISTANCE: mostly sideways on
 * a row is a swipe; downwards with the list at its top is a pull; anything
 * else is the browser's scroll, left alone.
 */
export function classify(dx: number, dy: number, scrollTop: number, onRow: boolean): Gesture {
  if (Math.hypot(dx, dy) < LOCK_DISTANCE) return "pending";
  if (Math.abs(dx) > Math.abs(dy) * 1.2) return onRow ? "swipe" : "scroll";
  if (dy > 0 && scrollTop <= 0) return "pull";
  return "scroll";
}

export interface SwipeOptions {
  /** Release past this share of the row's width to commit. */
  commitFraction: number;
  /** Or flick: this fast (px/ms) ... */
  flingVelocity: number;
  /** ... and at least this far. */
  flingDistance: number;
}

export const SWIPE_DEFAULTS: SwipeOptions = { commitFraction: 0.35, flingVelocity: 0.6, flingDistance: 48 };

/** A row swipe from its first sideways move to release. */
export class SwipeTracker {
  #x0 = 0;
  #lastX = 0;
  #lastT = 0;
  #velocity = 0;
  #offset = 0;
  readonly #width: number;
  readonly #allowed: Readonly<Record<Direction, boolean>>;
  readonly #o: SwipeOptions;

  constructor(width: number, allowed: Readonly<Record<Direction, boolean>>, options: SwipeOptions = SWIPE_DEFAULTS) {
    this.#width = Math.max(1, width);
    this.#allowed = allowed;
    this.#o = options;
  }

  start(x: number, t: number): void {
    this.#x0 = x;
    this.#lastX = x;
    this.#lastT = t;
    this.#velocity = 0;
    this.#offset = 0;
  }

  /** The row's offset for this point. A direction with no action resists and never commits. */
  move(x: number, t: number): number {
    const dt = t - this.#lastT;
    if (dt > 0) this.#velocity = (x - this.#lastX) / dt;
    this.#lastX = x;
    this.#lastT = t;
    const dx = x - this.#x0;
    const direction: Direction = dx < 0 ? "left" : "right";
    this.#offset = this.#allowed[direction] ? Math.max(-this.#width, Math.min(this.#width, dx)) : dx / 6;
    return this.#offset;
  }

  get offset(): number {
    return this.#offset;
  }

  get direction(): Direction | null {
    return this.#offset < 0 ? "left" : this.#offset > 0 ? "right" : null;
  }

  /** Far enough (or fast enough) that letting go now commits. */
  get armed(): boolean {
    const direction = this.direction;
    if (!direction || !this.#allowed[direction]) return false;
    const distance = Math.abs(this.#offset);
    if (distance >= this.#width * this.#o.commitFraction) return true;
    return distance >= this.#o.flingDistance && Math.sign(this.#velocity) === Math.sign(this.#offset) && Math.abs(this.#velocity) >= this.#o.flingVelocity;
  }

  /** Letting go: the direction to act on, or null to spring back. */
  end(): Direction | null {
    return this.armed ? this.direction : null;
  }
}

export interface PullOptions {
  /** Pull this far (after resistance) to refresh on release. */
  threshold: number;
  /** The indicator stops here. */
  max: number;
  /** The indicator moves this fraction of the finger. */
  resistance: number;
}

export const PULL_DEFAULTS: PullOptions = { threshold: 64, max: 96, resistance: 0.5 };

/** A pull down at the top of the list. */
export class PullTracker {
  #y0 = 0;
  #distance = 0;
  readonly #o: PullOptions;

  constructor(options: PullOptions = PULL_DEFAULTS) {
    this.#o = options;
  }

  start(y: number): void {
    this.#y0 = y;
    this.#distance = 0;
  }

  move(y: number): number {
    this.#distance = Math.max(0, Math.min(this.#o.max, (y - this.#y0) * this.#o.resistance));
    return this.#distance;
  }

  get distance(): number {
    return this.#distance;
  }

  get armed(): boolean {
    return this.#distance >= this.#o.threshold;
  }

  /** Letting go: refresh? */
  end(): boolean {
    return this.armed;
  }
}

/** What the list allows: brief 06's presentation. */
export interface SwipeContext {
  canArchive: boolean;
  deleteForever: boolean;
}

/** The action a swipe in `direction` performs here, or null when it does nothing (Archive in Trash, say). */
export function swipeOutcome(direction: Direction, actions: Readonly<Record<Direction, SwipeAction>>, context: SwipeContext): Exclude<SwipeAction, "none"> | null {
  const action = actions[direction];
  if (action === "none") return null;
  if (action === "archive" && !context.canArchive) return null;
  return action;
}

/** The words on the colour behind a swiped row. */
export function swipeLabel(action: Exclude<SwipeAction, "none">, unread: boolean, context: SwipeContext): string {
  switch (action) {
    case "archive":
      return "Archive";
    case "delete":
      return context.deleteForever ? "Delete forever" : "Delete";
    case "read":
      return unread ? "Mark as read" : "Mark as unread";
  }
}
