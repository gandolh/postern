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

  // Closing returns focus to where it was when the window opened (the list row, the Reply button).
  const opener = useRef<Element | null>(typeof document === "undefined" ? null : document.activeElement);
  useLayoutEffect(() => {
    const from = opener.current;
    const dialog = ref.current;
    return () => {
      const active = document.activeElement;
      if (
        from instanceof HTMLElement &&
        from.isConnected &&
        (active === document.body || active === null || dialog?.contains(active) || !active.isConnected)
      )
        from.focus();
    };
  }, []);

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
      className="relative inset-auto m-0 flex h-[min(32.5rem,calc(100vh-var(--topbar-height)-1rem))] max-h-none w-[max(22rem,min(35rem,calc(100vw-var(--nav-width)-var(--list-width)-3rem)))] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-t-xl border border-b-0 border-border bg-surface-raised p-0 text-text shadow-lg not-open:hidden backdrop:bg-scrim data-[placement=fullscreen]:fixed data-[placement=fullscreen]:inset-0 data-[placement=fullscreen]:m-auto data-[placement=fullscreen]:h-[min(56rem,calc(100vh-4rem))] data-[placement=fullscreen]:w-[min(72rem,calc(100vw-4rem))] data-[placement=fullscreen]:max-w-none data-[placement=fullscreen]:rounded-xl data-[placement=fullscreen]:border-b data-[placement=minimised]:h-auto data-[placement=minimised]:w-64 motion-safe:animate-compose-in max-lg:w-136 max-sm:data-[placement=docked]:fixed max-sm:data-[placement=docked]:inset-0 max-sm:data-[placement=docked]:z-overlay max-sm:data-[placement=docked]:h-auto max-sm:data-[placement=docked]:w-auto max-sm:data-[placement=docked]:max-w-none max-sm:data-[placement=docked]:rounded-none max-sm:data-[placement=docked]:border-0 max-sm:data-[placement=fullscreen]:fixed max-sm:data-[placement=fullscreen]:inset-0 max-sm:data-[placement=fullscreen]:z-overlay max-sm:data-[placement=fullscreen]:h-auto max-sm:data-[placement=fullscreen]:w-auto max-sm:data-[placement=fullscreen]:max-w-none max-sm:data-[placement=fullscreen]:rounded-none max-sm:data-[placement=fullscreen]:border-0"
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
      <div className="flex h-12 flex-none items-center border-b border-border bg-surface-sunken pr-1 pl-5 max-sm:h-14 max-sm:pl-4">
        <h2 id={titleId} className="min-w-0 flex-[1_1_auto] text-md font-bold">
          {fullscreen ? (
            <span className="block w-full overflow-hidden py-2 text-left text-ellipsis whitespace-nowrap text-text">
              {titleOf(state)}
            </span>
          ) : (
            <button
              type="button"
              className="block w-full cursor-pointer overflow-hidden py-2 text-left text-ellipsis whitespace-nowrap text-text focus-visible:rounded-sm focus-visible:[outline:var(--focus-ring)] focus-visible:-outline-offset-2 max-sm:min-h-11"
              aria-expanded={!minimised}
              onClick={toggleMinimise}
            >
              {titleOf(state)}
            </button>
          )}
        </h2>
        <span className="flex flex-none [--icon-size:1.125rem] [&_[data-slot=icon-button]]:size-9 max-sm:[&_[data-slot=icon-button]]:size-11">
          {!fullscreen ? (
            <IconButton
              label={minimised ? "Restore" : "Minimise"}
              icon={Minus}
              tooltip="end"
              onClick={toggleMinimise}
            />
          ) : null}
          <IconButton
            label={fullscreen ? "Exit full screen" : "Full screen"}
            icon={fullscreen ? Minimize2 : Maximize2}
            tooltip="end"
            onClick={toggleFullscreen}
          />
          <IconButton label="Save & close" icon={X} tooltip="end" onClick={close} />
        </span>
      </div>
      <div className="relative flex min-h-0 flex-[1_1_auto] flex-col" hidden={minimised}>
        <ComposeForm session={session} state={state} variant="window" />
        {dragging ? (
          <div
            className="absolute inset-2 z-inline grid place-items-center rounded-lg border-2 border-dashed border-accent bg-accent-soft font-semibold text-on-accent-soft"
            aria-hidden="true"
          >
            Drop files here to attach them
          </div>
        ) : null}
      </div>
    </dialog>
  );
}
