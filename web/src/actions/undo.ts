// The undoable actions, for the toast's Undo and the `z` key (brief 14).
// Everything undoable registers here: the mail actions (./runner.ts, the
// quiet ones without a toast too), Undo send (composer/store.ts) and Block
// sender (filters/BlockSender.tsx).
//
// Two ways in, which never disagree about what a button says:
//   - a toast's Undo runs its own entry, if it is still pending, whatever
//     happened since (runUndo): "Conversation archived. Undo" undoes the
//     archive even after a quiet star;
//   - `z` runs the most recent entry (undoLast). Gmail undoes only the most
//     recent action, so once z has run it, z does nothing until the next
//     action, and pressing z twice does not undo twice.
// Running an entry either way removes it, so nothing is undone twice. An
// entry that can no longer be undone (a held message that went out) leaves
// with clearUndo(entry). Every undo shows its own toast, which replaces the
// one that offered it.
//
//   setUndo(entry)        register an action as the most recent
//   undoLast()            z; false if there is nothing to undo
//   runUndo(entry)        a toast's Undo; false if that entry is gone
//   peekUndo()            what z would undo ({ label })
//   clearUndo(entry?)     forget one entry, or all of them (sign-out)
//   subscribeUndo(fn)     hear when it changes

export interface UndoEntry {
  /** What it undoes, for screen readers and the help text: "Conversation archived." */
  label: string;
  /** Put things back. Shows its own toast. */
  undo: () => Promise<void>;
}

/** Entries kept for their toasts; older ones have no toast left on screen to reach them. */
const MAX_PENDING = 20;

/** Every entry that can still be undone, oldest first. */
let pending: UndoEntry[] = [];
/** What z undoes: the most recent action, until it is undone or gone. */
let last: UndoEntry | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of [...listeners]) listener();
}

/** Register `entry` as the most recent undoable action. */
export function setUndo(entry: UndoEntry): void {
  pending = [...pending.filter((e) => e !== entry), entry].slice(-MAX_PENDING);
  last = entry;
  notify();
}

/** Forget `entry`, or every entry when none is given. */
export function clearUndo(entry?: UndoEntry): void {
  if (!entry) {
    if (pending.length === 0 && last === null) return;
    pending = [];
    last = null;
    notify();
    return;
  }
  if (!pending.includes(entry) && last !== entry) return;
  pending = pending.filter((e) => e !== entry);
  if (last === entry) last = null;
  notify();
}

/** What z would undo. */
export function peekUndo(): Pick<UndoEntry, "label"> | null {
  return last ? { label: last.label } : null;
}

/** z: undo the most recent action. Resolves false when there was nothing to undo. */
export async function undoLast(): Promise<boolean> {
  const entry = last;
  if (!entry) return false;
  clearUndo(entry);
  await entry.undo();
  return true;
}

/** A toast's Undo: run `entry` if it is still pending, whether or not it is the most recent. */
export async function runUndo(entry: UndoEntry): Promise<boolean> {
  if (!pending.includes(entry)) return false;
  clearUndo(entry);
  await entry.undo();
  return true;
}

export function subscribeUndo(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
