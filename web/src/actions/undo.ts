// The last undoable action, for the toast's Undo and the `z` key (brief 14).
// Gmail undoes only the most recent action; so does this. Running it clears
// it, so pressing z twice does not undo twice.
//
//   undoLast()            run the last action's undo; false if there is none
//   peekUndo()            what it would undo ({ label })
//   subscribeUndo(fn)     hear when it changes

export interface UndoEntry {
  /** What it undoes, for screen readers and the help text: "Conversation archived." */
  label: string;
  /** Put things back. Shows its own toast. */
  undo: () => Promise<void>;
}

let last: UndoEntry | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of [...listeners]) listener();
}

/** Make `entry` the action z undoes. */
export function setUndo(entry: UndoEntry): void {
  last = entry;
  notify();
}

/** Forget the undoable action (only if it is still `entry`, when given). */
export function clearUndo(entry?: UndoEntry): void {
  if (entry && last !== entry) return;
  if (last === null) return;
  last = null;
  notify();
}

export function peekUndo(): Pick<UndoEntry, "label"> | null {
  return last ? { label: last.label } : null;
}

/** Undo the last action. Resolves false when there was nothing to undo. */
export async function undoLast(): Promise<boolean> {
  const entry = last;
  if (!entry) return false;
  clearUndo(entry);
  await entry.undo();
  return true;
}

/** Run `entry` if it is still the last action (the toast's Undo button). */
export async function runUndo(entry: UndoEntry): Promise<boolean> {
  if (last !== entry) return false;
  return undoLast();
}

export function subscribeUndo(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
