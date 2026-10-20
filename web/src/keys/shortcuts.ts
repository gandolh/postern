// The shortcut registry and the key engine (brief 14).
//
// SHORTCUTS is the one list: the engine matches against it and the help sheet
// prints it, so they cannot drift. The engine is plain TypeScript (no React):
// ShortcutsHost feeds it keydown events and supplies the actions.
//
// A key is normalised to a token: the typed character for punctuation
// ("#", "!", "?", "/"), a lower-case letter, or an upper-case letter when
// Shift is held ("I", "U", "C"). That keeps `#` and `?` working on layouts
// where they need Shift (or AltGr) and ignores Caps Lock.

export type ShortcutGroup = "Navigation" | "Application" | "Conversations" | "Composing";

export const GROUP_ORDER: readonly ShortcutGroup[] = ["Navigation", "Application", "Conversations", "Composing"];

export type ActionId =
  | "compose"
  | "composeFullscreen"
  | "search"
  | "help"
  | "next"
  | "previous"
  | "open"
  | "back"
  | "nextMessage"
  | "previousMessage"
  | "archive"
  | "trash"
  | "reportSpam"
  | "star"
  | "select"
  | "markRead"
  | "markUnread"
  | "markImportant"
  | "markNotImportant"
  | "reply"
  | "replyAll"
  | "forward"
  | "label"
  | "move"
  | "undo"
  | "goInbox"
  | "goStarred"
  | "goSent"
  | "goDrafts"
  | "goAll"
  | "send";

export interface Shortcut {
  id: ActionId;
  group: ShortcutGroup;
  /** What it does, as the help sheet says it. */
  description: string;
  /** Each way to trigger it: a sequence of key tokens (one token for most). */
  keys: readonly (readonly string[])[];
  /** Held down, the key repeats the action (j, k, n, p). */
  repeats?: boolean;
  /** Listed in the help sheet but handled elsewhere (the composer's own Ctrl+Enter). */
  external?: boolean;
  /** How to show a token that is not the plain character. */
  display?: readonly (readonly string[])[];
}

export const SHORTCUTS: readonly Shortcut[] = [
  { id: "goInbox", group: "Navigation", description: "Go to Inbox", keys: [["g", "i"]] },
  { id: "goStarred", group: "Navigation", description: "Go to Starred", keys: [["g", "s"]] },
  { id: "goSent", group: "Navigation", description: "Go to Sent", keys: [["g", "t"]] },
  { id: "goDrafts", group: "Navigation", description: "Go to Drafts", keys: [["g", "d"]] },
  { id: "goAll", group: "Navigation", description: "Go to All Mail", keys: [["g", "a"]] },
  { id: "next", group: "Navigation", description: "Next conversation", keys: [["j"]], repeats: true },
  { id: "previous", group: "Navigation", description: "Previous conversation", keys: [["k"]], repeats: true },
  { id: "open", group: "Navigation", description: "Open the conversation (or open or close a message)", keys: [["o"]], display: [["o"], ["Enter"]] },
  { id: "back", group: "Navigation", description: "Back to the list", keys: [["u"]] },
  { id: "nextMessage", group: "Navigation", description: "Next message in the conversation", keys: [["n"]], repeats: true },
  { id: "previousMessage", group: "Navigation", description: "Previous message in the conversation", keys: [["p"]], repeats: true },

  { id: "compose", group: "Application", description: "Compose a new message", keys: [["c"]] },
  { id: "composeFullscreen", group: "Application", description: "Compose in a full-screen window", keys: [["C"]], display: [["Shift", "C"]] },
  { id: "search", group: "Application", description: "Search mail", keys: [["/"]] },
  { id: "help", group: "Application", description: "Show keyboard shortcuts", keys: [["?"]] },
  { id: "undo", group: "Application", description: "Undo the last action", keys: [["z"]] },

  { id: "archive", group: "Conversations", description: "Archive", keys: [["e"]] },
  { id: "trash", group: "Conversations", description: "Delete", keys: [["#"]] },
  { id: "reportSpam", group: "Conversations", description: "Report spam (Not spam in Spam)", keys: [["!"]] },
  { id: "star", group: "Conversations", description: "Star or unstar", keys: [["s"]] },
  { id: "select", group: "Conversations", description: "Select or deselect", keys: [["x"]] },
  { id: "markRead", group: "Conversations", description: "Mark as read", keys: [["I"]], display: [["Shift", "I"]] },
  { id: "markUnread", group: "Conversations", description: "Mark as unread", keys: [["U"]], display: [["Shift", "U"]] },
  { id: "markImportant", group: "Conversations", description: "Mark as important", keys: [["+"], ["="]] },
  { id: "markNotImportant", group: "Conversations", description: "Mark as not important", keys: [["-"]] },
  { id: "label", group: "Conversations", description: "Label as", keys: [["l"]] },
  { id: "move", group: "Conversations", description: "Move to", keys: [["v"]] },

  { id: "reply", group: "Composing", description: "Reply", keys: [["r"]] },
  { id: "replyAll", group: "Composing", description: "Reply all", keys: [["a"]] },
  { id: "forward", group: "Composing", description: "Forward", keys: [["f"]] },
  { id: "send", group: "Composing", description: "Send the message", keys: [["Ctrl", "Enter"]], external: true },
];

/** Two-key sequences give up after this long. */
export const SEQUENCE_TIMEOUT_MS = 1500;

/** The tokens a shortcut is drawn with in the help sheet (Shift+I rather than I). */
export function displayKeys(shortcut: Shortcut): string[][] {
  return (shortcut.display ?? shortcut.keys).map((k) => [...k]);
}

/** Everything a shortcut matches in the help sheet's search box, lower-cased. */
export function searchText(shortcut: Shortcut): string {
  const keys = displayKeys(shortcut).map((k) => k.join(" then ").replace(/ then /g, " "));
  return `${shortcut.description} ${keys.join(" ")} ${shortcut.group}`.toLowerCase();
}

/** The shortcuts matching a search ("archive", "g i", "star"), grouped in Gmail's order; empty groups are dropped. */
export function filterShortcuts(query: string): { group: ShortcutGroup; items: Shortcut[] }[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const hits = SHORTCUTS.filter((s) => {
    const text = searchText(s);
    return words.every((w) => text.includes(w));
  });
  return GROUP_ORDER.map((group) => ({ group, items: hits.filter((s) => s.group === group) })).filter((g) => g.items.length > 0);
}

// ---- The key engine ----------------------------------------------------------------

/** True where typing must not trigger shortcuts: fields, editors, menus, dialogs, the composer. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target.closest("input, textarea, select, [contenteditable]:not([contenteditable='false'])")) return true;
  if (target instanceof HTMLElement && target.isContentEditable) return true;
  // The composer (its buttons too), menus, listboxes, dialogs and the sender hover card keep their own keys.
  if (target.closest("[data-compose-key], [role='menu'], [role='listbox'], [role='combobox'], [role='dialog'], [role='alertdialog'], dialog[open], .contacts-hovercard")) return true;
  return false;
}

/** The token for a key event, or null for a bare modifier / dead key. */
export function tokenOf(event: Pick<KeyboardEvent, "key" | "shiftKey">): string | null {
  const key = event.key;
  if (!key || key === "Dead" || key === "Unidentified") return null;
  if (key === "Shift" || key === "Control" || key === "Alt" || key === "Meta" || key === "CapsLock") return null;
  if (key.length === 1 && /\p{L}/u.test(key)) return event.shiftKey ? key.toUpperCase() : key.toLowerCase();
  return key;
}

export type KeyActions = Partial<Record<ActionId, () => boolean | void | Promise<unknown>>>;

export interface KeyEngineOptions {
  /** Settings' "Keyboard shortcuts on" switch. */
  enabled(): boolean;
  /** The clock (tests). */
  now?(): number;
  /** Where a keypress is allowed to count (default: not in a field, menu, dialog or composer). */
  isBlocked?(target: EventTarget | null): boolean;
}

/** Matches keydown events to SHORTCUTS, with `g` then `i` style sequences. */
export class KeyEngine {
  private pending: string | null = null;
  private pendingAt = 0;
  private readonly firstKeys = new Map<string, Shortcut[]>();
  private readonly now: () => number;
  private readonly isBlocked: (target: EventTarget | null) => boolean;

  constructor(
    private readonly actions: KeyActions,
    private readonly options: KeyEngineOptions,
  ) {
    this.now = options.now ?? (() => Date.now());
    this.isBlocked = options.isBlocked ?? isTypingTarget;
    for (const shortcut of SHORTCUTS) {
      if (shortcut.external) continue;
      for (const keys of shortcut.keys) {
        const first = keys[0]!;
        this.firstKeys.set(first, [...(this.firstKeys.get(first) ?? []), shortcut]);
      }
    }
  }

  /** Handle a keydown. Returns true when a shortcut ran (the caller calls preventDefault). */
  handle(event: KeyboardEvent): boolean {
    if (event.defaultPrevented || event.isComposing) return false;
    if (!this.options.enabled()) {
      this.pending = null;
      return false;
    }
    if (event.ctrlKey || event.altKey || event.metaKey) {
      this.pending = null;
      return false;
    }
    const token = tokenOf(event);
    if (token === null) return false;
    if (this.isBlocked(event.target)) {
      this.pending = null;
      return false;
    }

    if (this.pending !== null) {
      const first = this.pending;
      const fresh = this.now() - this.pendingAt <= SEQUENCE_TIMEOUT_MS;
      this.pending = null;
      if (fresh && !event.repeat) {
        const hit = SHORTCUTS.find((s) => !s.external && s.keys.some((k) => k.length === 2 && k[0] === first && k[1] === token));
        // A key that does not finish the sequence ends it and does nothing else.
        return hit ? this.run(hit.id) : token === first ? this.begin(token) : false;
      }
    }

    const candidates = this.firstKeys.get(token);
    if (!candidates) return false;
    // A sequence starts on its first key only when no shortcut is just that key.
    const single = candidates.find((s) => s.keys.some((k) => k.length === 1 && k[0] === token));
    if (!single) return this.begin(token);
    if (event.repeat && !single.repeats) return false;
    return this.run(single.id);
  }

  /** Forget a half-typed sequence (route changes, blur). */
  reset(): void {
    this.pending = null;
  }

  private begin(token: string): boolean {
    this.pending = token;
    this.pendingAt = this.now();
    return true;
  }

  private run(id: ActionId): boolean {
    const action = this.actions[id];
    if (!action) return false;
    const result = action();
    if (result instanceof Promise) {
      result.catch(() => undefined);
      return true;
    }
    return result !== false;
  }
}
