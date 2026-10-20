// The composer's rich-text editor: a contentEditable region with Postern's
// own formatting (./format.ts), its own undo stack (./history.ts), and every
// way HTML can arrive (paste, drop, draft, signature, quote) going through
// ./sanitize.ts first. The editor's DOM is the app's DOM: nothing reaches it
// any other way.

import { Bold, Italic, Link2, List, ListOrdered, RemoveFormatting, TextQuote, Underline, type LucideIcon } from "lucide-react";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ClipboardEvent, type DragEvent, type KeyboardEvent, type ReactNode } from "react";
import type { ComposeSession } from "../session";
import {
  activeFormats,
  clearFormatting,
  editorRange,
  insertLink,
  insertNodes,
  linkAt,
  NO_FORMATS,
  normalizeLinkInput,
  rangeAtEnd,
  removeLink,
  selectedText,
  selectRange,
  toggleList,
  toggleMark,
  toggleQuote,
  updateLink,
  type ActiveFormats,
  type Mark,
} from "./format";
import { EditorHistory } from "./history";
import { CID_ATTR, dataUrlToFile, sanitizeForEditor } from "./sanitize";
import { serializeEditor } from "./serialize";

export interface EditorProps {
  session: ComposeSession;
  /** The body to load (outgoing form); loaded on mount and whenever `revision` changes. */
  html: string;
  revision: number;
  label: string;
  showToolbar: boolean;
  /** Where the toolbar sits (the window's footer area). */
  toolbarId?: string;
  /** Files dropped on the body: attach them. */
  onAttach(files: File[]): void;
  /** Shown between the text and the formatting bar (the trimmed-content button, the attachments). */
  children?: ReactNode;
}

const RASTER = /^image\/(png|jpeg|gif|webp)$/i;

interface LinkDraft {
  range: Range;
  anchor: HTMLAnchorElement | null;
  text: string;
  href: string;
  error: string | null;
}

/** Where a drop landed, as a collapsed range (Chrome's caretRangeFromPoint, or the standard caretPositionFromPoint). */
function rangeFromPoint(x: number, y: number): Range | null {
  const doc = document as Document & {
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
  };
  if (doc.caretPositionFromPoint) {
    const pos = doc.caretPositionFromPoint(x, y);
    if (!pos) return null;
    const range = document.createRange();
    range.setStart(pos.offsetNode, pos.offset);
    range.collapse(true);
    return range;
  }
  return doc.caretRangeFromPoint?.(x, y) ?? null;
}

/** Plain text as nodes for the current line: text runs split by <br>. */
function textNodes(text: string): DocumentFragment {
  const fragment = document.createDocumentFragment();
  text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .forEach((line, i) => {
      if (i > 0) fragment.append(document.createElement("br"));
      if (line) fragment.append(document.createTextNode(line));
    });
  return fragment;
}

export function Editor({ session, html, revision, label, showToolbar, toolbarId, onAttach, children }: EditorProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const historyRef = useRef<EditorHistory | null>(null);
  const linkTextRef = useRef<HTMLInputElement>(null);
  const [formats, setFormats] = useState<ActiveFormats>(NO_FORMATS);
  const [link, setLink] = useState<LinkDraft | null>(null);
  const linkId = useId();

  const history = useCallback((): EditorHistory | null => {
    const root = rootRef.current;
    if (!root) return null;
    if (!historyRef.current) historyRef.current = new EditorHistory(root);
    return historyRef.current;
  }, []);

  const refreshFormats = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;
    setFormats(activeFormats(root, editorRange(root)));
  }, []);

  const changed = useCallback(() => {
    session.bodyChanged();
    refreshFormats();
  }, [session, refreshFormats]);

  // Load the body on mount, and when the session replaces it (a draft opened, plain text turned rich, undo send).
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    root.replaceChildren(sanitizeForEditor(html, { mode: "load", cidUrls: session.cidUrls() }).fragment);
    history()?.reset();
    // Only when the content is replaced, not on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revision]);

  // The session reads the body through this bridge while the editor is mounted.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const bridge = {
      read: () => serializeEditor(root),
      setSignature: (sig: string | null) => {
        history()?.record(`sig-${Date.now()}`);
        root.querySelector(".postern_signature")?.remove();
        if (sig) root.append(sanitizeForEditor(sig, { mode: "load" }).fragment);
      },
      append: (extra: string) => {
        root.append(sanitizeForEditor(extra, { mode: "load", cidUrls: session.cidUrls() }).fragment);
      },
      focus: () => {
        root.focus();
        if (!editorRange(root)) selectRange(firstLineRange(root));
      },
      insertImage: (cid: string, url: string, alt: string) => {
        history()?.record(`image-${Date.now()}`);
        const img = document.createElement("img");
        img.setAttribute("src", url);
        img.setAttribute(CID_ATTR, cid);
        img.setAttribute("alt", alt);
        const next = insertNodes(root, editorRange(root) ?? rangeAtEnd(root), img);
        selectRange(next);
        session.bodyChanged();
      },
    };
    session.bindEditor(bridge);
    return () => session.unbindEditor(bridge);
  }, [session, history]);

  // The browser's own undo and formatting inputs: Postern's history and formatting instead.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const onBeforeInput = (event: InputEvent) => {
      const type = event.inputType;
      if (type === "historyUndo" || type === "historyRedo") {
        event.preventDefault();
        if (type === "historyUndo" ? history()?.undo() : history()?.redo()) changed();
        return;
      }
      if (type.startsWith("format")) {
        event.preventDefault();
        const mark: Mark | null = type === "formatBold" ? "b" : type === "formatItalic" ? "i" : type === "formatUnderline" ? "u" : type === "formatStrikeThrough" ? "s" : null;
        if (mark) applyMark(mark);
        return;
      }
      if (type === "insertFromPaste" || type === "insertFromDrop" || type === "insertFromPasteAsQuotation" || type === "insertFromYank") {
        // Paste and drop are handled (and sanitised) by their own events; never let the browser insert HTML.
        event.preventDefault();
        return;
      }
      history()?.record(type.startsWith("delete") ? "delete" : type === "insertText" ? "insert" : `${type}-${Date.now()}`);
    };
    root.addEventListener("beforeinput", onBeforeInput);
    const onSelection = () => {
      if (root.contains(document.activeElement) || root === document.activeElement) refreshFormats();
    };
    document.addEventListener("selectionchange", onSelection);
    return () => {
      root.removeEventListener("beforeinput", onBeforeInput);
      document.removeEventListener("selectionchange", onSelection);
    };
    // applyMark is stable enough: it reads refs only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history, changed, refreshFormats]);

  function run(op: (root: HTMLElement, range: Range) => Range | null): void {
    const root = rootRef.current;
    if (!root) return;
    const range = editorRange(root) ?? rangeAtEnd(root);
    history()?.record(`format-${Date.now()}`);
    const next = op(root, range);
    root.focus();
    if (next) selectRange(next);
    changed();
  }

  function applyMark(mark: Mark): void {
    run((root, range) => toggleMark(root, range, mark));
  }

  function openLink(): void {
    const root = rootRef.current;
    if (!root) return;
    const range = editorRange(root) ?? rangeAtEnd(root);
    const anchor = linkAt(root, range);
    setLink({
      range,
      anchor,
      text: anchor ? (anchor.textContent ?? "") : selectedText(range),
      href: anchor ? (anchor.getAttribute("href") ?? "").replace(/^mailto:/i, "") : "",
      error: null,
    });
  }

  function saveLink(): void {
    if (!link) return;
    const href = normalizeLinkInput(link.href);
    if (!href) {
      setLink({ ...link, error: "Enter a web address (like example.com) or an email address." });
      return;
    }
    const root = rootRef.current;
    if (!root) return;
    history()?.record(`link-${Date.now()}`);
    const next = link.anchor && root.contains(link.anchor) ? updateLink(link.anchor, href, link.text) : insertLink(root, link.range, href, link.text);
    setLink(null);
    root.focus();
    selectRange(next);
    changed();
  }

  function unlink(): void {
    if (!link?.anchor) return;
    const root = rootRef.current;
    history()?.record(`unlink-${Date.now()}`);
    const next = removeLink(link.anchor);
    setLink(null);
    root?.focus();
    if (next) selectRange(next);
    changed();
  }

  function insertAt(range: Range, nodes: DocumentFragment | Node): void {
    const root = rootRef.current;
    if (!root) return;
    const next = insertNodes(root, range, nodes);
    selectRange(next);
    changed();
  }

  function imageNode(file: File): HTMLImageElement {
    const { cid, url } = session.addInlineImage(file);
    const img = document.createElement("img");
    img.setAttribute("src", url);
    img.setAttribute(CID_ATTR, cid);
    img.setAttribute("alt", file.name);
    return img;
  }

  function onPaste(event: ClipboardEvent<HTMLDivElement>): void {
    event.preventDefault();
    const root = rootRef.current;
    if (!root) return;
    const data = event.clipboardData;
    const range = editorRange(root) ?? rangeAtEnd(root);
    history()?.record(`paste-${Date.now()}`);
    const html = data.types.includes("text/html") ? data.getData("text/html") : "";
    const images = Array.from(data.files ?? []).filter((f) => RASTER.test(f.type));
    if (html) {
      const clean = sanitizeForEditor(html, { mode: "paste" });
      const hasText = (clean.fragment.textContent ?? "").trim() !== "";
      if (hasText || images.length === 0) {
        let n = 1;
        for (const pending of clean.pending) {
          const file = dataUrlToFile(pending.dataUrl, `pasted-image-${n++}`);
          if (!file) {
            pending.img.remove();
            continue;
          }
          const { cid, url } = session.addInlineImage(file);
          pending.img.setAttribute("src", url);
          pending.img.setAttribute(CID_ATTR, cid);
          if (!pending.img.getAttribute("alt")) pending.img.setAttribute("alt", file.name);
        }
        insertAt(range, clean.fragment);
        return;
      }
    }
    if (images.length) {
      const fragment = document.createDocumentFragment();
      for (const file of images) fragment.append(imageNode(file));
      insertAt(range, fragment);
      return;
    }
    const text = data.getData("text/plain");
    if (text) insertAt(range, textNodes(text));
  }

  function onDrop(event: DragEvent<HTMLDivElement>): void {
    const data = event.dataTransfer;
    event.preventDefault();
    if (data.types.includes("Files")) {
      // Files dropped on the body are attachments (pasted images go inline).
      event.stopPropagation();
      onAttach(Array.from(data.files));
      return;
    }
    const root = rootRef.current;
    if (!root) return;
    const range = rangeFromPoint(event.clientX, event.clientY);
    const at = range && root.contains(range.startContainer) ? range : (editorRange(root) ?? rangeAtEnd(root));
    history()?.record(`drop-${Date.now()}`);
    const html = data.getData("text/html");
    if (html) insertAt(at, sanitizeForEditor(html, { mode: "load" }).fragment);
    else {
      const text = data.getData("text/plain");
      if (text) insertAt(at, textNodes(text));
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    const mod = event.ctrlKey || event.metaKey;
    if (!mod || event.altKey) return;
    const key = event.key.toLowerCase();
    const handled = () => {
      event.preventDefault();
      event.stopPropagation();
    };
    if (!event.shiftKey && (key === "b" || key === "i" || key === "u")) {
      handled();
      applyMark(key as Mark);
    } else if (!event.shiftKey && key === "k") {
      handled();
      openLink();
    } else if (event.shiftKey && event.code === "Digit7") {
      handled();
      run((root, range) => toggleList(root, range, "ol"));
    } else if (event.shiftKey && event.code === "Digit8") {
      handled();
      run((root, range) => toggleList(root, range, "ul"));
    } else if (event.shiftKey && event.code === "Digit9") {
      handled();
      run((root, range) => toggleQuote(root, range));
    } else if (key === "\\") {
      handled();
      run((root, range) => clearFormatting(root, range));
    } else if (key === "z" || key === "y") {
      handled();
      const redo = key === "y" || event.shiftKey;
      if (redo ? history()?.redo() : history()?.undo()) changed();
    }
  }

  useEffect(() => {
    if (link) linkTextRef.current?.focus();
  }, [link]);

  const tools: { label: string; keys: string; icon: LucideIcon; pressed?: boolean; action: () => void }[] = [
    { label: "Bold", keys: "Ctrl+B", icon: Bold, pressed: formats.b, action: () => applyMark("b") },
    { label: "Italic", keys: "Ctrl+I", icon: Italic, pressed: formats.i, action: () => applyMark("i") },
    { label: "Underline", keys: "Ctrl+U", icon: Underline, pressed: formats.u, action: () => applyMark("u") },
    { label: "Numbered list", keys: "Ctrl+Shift+7", icon: ListOrdered, pressed: formats.ol, action: () => run((root, range) => toggleList(root, range, "ol")) },
    { label: "Bulleted list", keys: "Ctrl+Shift+8", icon: List, pressed: formats.ul, action: () => run((root, range) => toggleList(root, range, "ul")) },
    { label: "Quote", keys: "Ctrl+Shift+9", icon: TextQuote, pressed: formats.quote, action: () => run((root, range) => toggleQuote(root, range)) },
    { label: "Link", keys: "Ctrl+K", icon: Link2, pressed: formats.link, action: openLink },
    { label: "Remove formatting", keys: "Ctrl+\\", icon: RemoveFormatting, action: () => run((root, range) => clearFormatting(root, range)) },
  ];

  return (
    <div className="compose-editor">
      <div
        ref={rootRef}
        className="compose-editor-body"
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label={label}
        spellCheck
        onInput={changed}
        onPaste={onPaste}
        onDrop={onDrop}
        onKeyDown={onKeyDown}
        onFocus={refreshFormats}
      />
      {children}
      {link ? (
        <div className="compose-link" role="group" aria-labelledby={`${linkId}-title`} onKeyDown={(e) => {
            if (e.key !== "Escape") return;
            e.stopPropagation();
            setLink(null);
          }}
        >
          <p id={`${linkId}-title`} className="compose-link-title">
            {link.anchor ? "Edit link" : "Add link"}
          </p>
          <label className="compose-link-field">
            <span>Text to display</span>
            <input ref={linkTextRef} className="input" value={link.text} onChange={(e) => setLink({ ...link, text: e.target.value })} />
          </label>
          <label className="compose-link-field">
            <span>Web address or email address</span>
            <input
              className="input"
              value={link.href}
              aria-invalid={link.error ? true : undefined}
              aria-describedby={link.error ? `${linkId}-error` : undefined}
              onChange={(e) => setLink({ ...link, href: e.target.value, error: null })}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                e.preventDefault();
                saveLink();
              }}
            />
          </label>
          {link.error ? (
            <p id={`${linkId}-error`} className="compose-link-error" role="alert">
              {link.error}
            </p>
          ) : null}
          <div className="compose-link-actions">
            {link.anchor ? (
              <button type="button" className="btn btn-quiet" onClick={unlink}>
                Remove link
              </button>
            ) : null}
            <button type="button" className="btn btn-quiet" onClick={() => setLink(null)}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" onClick={saveLink}>
              OK
            </button>
          </div>
        </div>
      ) : null}
      {showToolbar ? (
        <div id={toolbarId} className="compose-format" role="toolbar" aria-label="Formatting options">
          {tools.map((t) => (
            <button
              key={t.label}
              type="button"
              className="icon-btn compose-format-btn"
              aria-label={t.label}
              aria-pressed={t.pressed === undefined ? undefined : t.pressed}
              data-tooltip={`${t.label} (${t.keys})`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={t.action}
            >
              <t.icon aria-hidden="true" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function firstLineRange(root: HTMLElement): Range {
  const range = document.createRange();
  const first = root.firstChild;
  if (first && first.nodeType === Node.ELEMENT_NODE) range.setStart(first, 0);
  else range.setStart(root, 0);
  range.collapse(true);
  return range;
}
