// One composer window: docked bottom-right, minimised to its title bar, or
// full screen. It is a <dialog>: non-modal while docked (the mail stays
// usable), modal in full screen (the page behind is inert, Escape returns to
// docked). Switching between them keeps the same element, so the body and its
// undo history survive.

import { Maximize2, Minimize2, Minus, X } from "lucide-react";
import { useId, useLayoutEffect, useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import { IconButton } from "../shell/IconButton";
import { useComposerStore } from "./compose";
import { ComposeForm } from "./ComposeForm";
import type { ComposeSnapshot } from "./session";
import { COMPOSER_ATTR } from "./shortcuts";

function titleOf(state: ComposeSnapshot): string {
  const subject = state.subject.trim();
  if (subject) return subject;
  return state.mode === "forward" ? "Forward" : state.mode === "new" ? "New Message" : "Reply";
}

export function ComposerWindow({ state }: { state: ComposeSnapshot }) {
  const store = useComposerStore();
  const session = store.get(state.key);
  const ref = useRef<HTMLDialogElement>(null);
  const modalRef = useRef(false);
  const titleId = useId();
  const [dragging, setDragging] = useState(false);
  const placement = state.placement;
  const minimised = placement === "minimised";
  const fullscreen = placement === "fullscreen";

  // Modal in full screen, non-modal otherwise; the same element throughout.
  useLayoutEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (dialog.open && modalRef.current === fullscreen) return;
    if (dialog.open) {
      if (typeof dialog.close === "function") dialog.close();
      else dialog.removeAttribute("open");
    }
    if (fullscreen && typeof dialog.showModal === "function") dialog.showModal();
    else if (typeof dialog.show === "function") dialog.show();
    else dialog.setAttribute("open", "");
    modalRef.current = fullscreen;
  }, [fullscreen]);

  if (!session) return null;

  const close = () => void store.close(state.key);
  const toggleMinimise = () => store.setPlacement(state.key, minimised ? "docked" : "minimised");
  const toggleFullscreen = () => store.setPlacement(state.key, fullscreen ? "docked" : "fullscreen");

  function onKeyDown(event: KeyboardEvent<HTMLDialogElement>): void {
    if (event.key !== "Escape" || event.defaultPrevented) return;
    // Escape in a question asked over the window (a confirm dialog) is that dialog's.
    if (event.target instanceof Element && event.target.closest("dialog") !== event.currentTarget) return;
    event.preventDefault();
    if (fullscreen) store.setPlacement(state.key, "docked");
    else close();
  }

  const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer.types).includes("Files");

  return (
    <dialog
      ref={ref}
      className="compose-window"
      data-placement={placement}
      aria-labelledby={titleId}
      {...{ [COMPOSER_ATTR]: state.key }}
      onCancel={(e) => {
        // Escape on the modal (full screen) window: back to docked, not closed.
        e.preventDefault();
        store.setPlacement(state.key, "docked");
      }}
      onKeyDown={onKeyDown}
      onDragEnter={(e) => {
        if (!hasFiles(e) || minimised) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragOver={(e) => {
        if (!hasFiles(e) || minimised) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      }}
      onDragLeave={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
        setDragging(false);
      }}
      onDrop={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        setDragging(false);
        session.addFiles(Array.from(e.dataTransfer.files));
      }}
    >
      <header className="compose-titlebar">
        <h2 id={titleId} className="compose-title">
          {fullscreen ? (
            <span className="compose-title-text">{titleOf(state)}</span>
          ) : (
            <button type="button" className="compose-title-btn" aria-expanded={!minimised} onClick={toggleMinimise}>
              {titleOf(state)}
            </button>
          )}
        </h2>
        <span className="compose-titlebar-actions">
          {!fullscreen ? <IconButton label={minimised ? "Restore" : "Minimise"} icon={Minus} tooltip="end" onClick={toggleMinimise} /> : null}
          <IconButton label={fullscreen ? "Exit full screen" : "Full screen"} icon={fullscreen ? Minimize2 : Maximize2} tooltip="end" onClick={toggleFullscreen} />
          <IconButton label="Save & close" icon={X} tooltip="end" onClick={close} />
        </span>
      </header>
      <div className="compose-window-body" hidden={minimised}>
        <ComposeForm session={session} state={state} variant="window" />
        {dragging ? (
          <div className="compose-drop" aria-hidden="true">
            Drop files here to attach them
          </div>
        ) : null}
      </div>
    </dialog>
  );
}
