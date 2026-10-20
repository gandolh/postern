// How long a sent message is held in the client so Undo can take it back.
// Gmail's default is 5 seconds (choices 5, 10, 20, 30). Brief 12 owns the
// setting: it calls setUndoSendDelay(seconds * 1000) at start-up and when the
// user changes it (the per-device display settings have no field for it yet).

export const DEFAULT_UNDO_SEND_DELAY_MS = 5000;
/** Gmail's choices, in seconds. */
export const UNDO_SEND_CHOICES_S = [5, 10, 20, 30] as const;
/** The longest hold allowed. */
export const MAX_UNDO_SEND_DELAY_MS = 30_000;

let delayMs = DEFAULT_UNDO_SEND_DELAY_MS;

/** The current hold, in ms. */
export function getUndoSendDelay(): number {
  return delayMs;
}

/** Set the hold (0 sends at once; capped at 30 s). Takes effect for the next send. */
export function setUndoSendDelay(ms: number): void {
  delayMs = Number.isFinite(ms) ? Math.min(MAX_UNDO_SEND_DELAY_MS, Math.max(0, Math.round(ms))) : DEFAULT_UNDO_SEND_DELAY_MS;
}
