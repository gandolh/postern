// Undo and redo for the editor. The browser's own undo stack only knows about
// typing and execCommand; Postern's formatting moves DOM nodes itself, which
// that stack cannot follow. So the editor keeps its own: a copy of the content
// and the selection before each change (typing is grouped, one step per pause
// or per kind of edit), and handles Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y itself.

interface Snapshot {
  nodes: Node[];
  start: number[] | null;
  startOffset: number;
  end: number[] | null;
  endOffset: number;
}

const LIMIT = 100;
/** Typing within this long of the last step joins it. */
const GROUP_MS = 1000;

function pathTo(root: Node, node: Node): number[] | null {
  const path: number[] = [];
  let n: Node | null = node;
  while (n && n !== root) {
    const parent: Node | null = n.parentNode;
    if (!parent) return null;
    path.unshift(Array.prototype.indexOf.call(parent.childNodes, n));
    n = parent;
  }
  return n === root ? path : null;
}

function nodeAt(root: Node, path: number[]): Node | null {
  let n: Node | null = root;
  for (const i of path) {
    n = n?.childNodes[i] ?? null;
    if (!n) return null;
  }
  return n;
}

export class EditorHistory {
  readonly #root: HTMLElement;
  #undo: Snapshot[] = [];
  #redo: Snapshot[] = [];
  #lastKind = "";
  #lastAt = 0;

  constructor(root: HTMLElement) {
    this.#root = root;
  }

  /** Forget everything (new content loaded). */
  reset(): void {
    this.#undo = [];
    this.#redo = [];
    this.#lastKind = "";
  }

  /**
   * Remember the content before a change. `kind` groups typing: the same kind
   * within a second of the last one is one step. Formatting passes a unique
   * kind (always its own step).
   */
  record(kind: string, now = Date.now()): void {
    if (kind && kind === this.#lastKind && now - this.#lastAt < GROUP_MS) {
      this.#lastAt = now;
      return;
    }
    this.#lastKind = kind;
    this.#lastAt = now;
    this.#undo.push(this.#take());
    if (this.#undo.length > LIMIT) this.#undo.shift();
    this.#redo = [];
  }

  get canUndo(): boolean {
    return this.#undo.length > 0;
  }

  get canRedo(): boolean {
    return this.#redo.length > 0;
  }

  undo(): boolean {
    const snapshot = this.#undo.pop();
    if (!snapshot) return false;
    this.#redo.push(this.#take());
    this.#restore(snapshot);
    return true;
  }

  redo(): boolean {
    const snapshot = this.#redo.pop();
    if (!snapshot) return false;
    this.#undo.push(this.#take());
    this.#restore(snapshot);
    return true;
  }

  #take(): Snapshot {
    const root = this.#root;
    const selection = root.ownerDocument.getSelection();
    const range = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
    const inside = range && root.contains(range.commonAncestorContainer);
    return {
      nodes: Array.from(root.childNodes, (n) => n.cloneNode(true)),
      start: inside ? pathTo(root, range.startContainer) : null,
      startOffset: inside ? range.startOffset : 0,
      end: inside ? pathTo(root, range.endContainer) : null,
      endOffset: inside ? range.endOffset : 0,
    };
  }

  #restore(snapshot: Snapshot): void {
    const root = this.#root;
    root.replaceChildren(...snapshot.nodes.map((n) => n.cloneNode(true)));
    this.#lastKind = "";
    if (!snapshot.start || !snapshot.end) return;
    const start = nodeAt(root, snapshot.start);
    const end = nodeAt(root, snapshot.end);
    if (!start || !end) return;
    try {
      const range = root.ownerDocument.createRange();
      range.setStart(start, snapshot.startOffset);
      range.setEnd(end, snapshot.endOffset);
      const selection = root.ownerDocument.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    } catch {
      // An offset past the end: leave the selection where it is.
    }
  }
}
