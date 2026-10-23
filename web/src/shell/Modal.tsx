// The modal dialogs' shared shape (brief 20): Base UI's Dialog, or its
// AlertDialog for a confirmation, with a backdrop, in the right layer. Base UI
// does the focus trap, the inert page behind, Escape and focus return; each
// dialog keeps its own look through `className`.
//
// The right layer: the composer is still a native <dialog>, and full screen it
// is modal, in the top layer, with everything outside it inert. So a dialog
// opened from inside it is portalled into it, and one opened elsewhere while it
// is up (the session expiring) goes into it too. Otherwise, <body>.

import { AlertDialog } from "@base-ui/react/alert-dialog";
import { Dialog } from "@base-ui/react/dialog";
import { useCallback, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import "./modal.css";

/** Whether `element` is a native <dialog> in the top layer. jsdom's selector engine doesn't know :modal. */
function isModal(element: Element): boolean {
  try {
    return element.matches("dialog:modal");
  } catch {
    return false;
  }
}

/** The container for a dialog opened at `from`: its own modal <dialog>, else the last one open, else <body>. */
export function layerFor(from: Element): HTMLElement {
  for (let element = from.parentElement; element; element = element.parentElement) {
    if (isModal(element)) return element;
  }
  return Array.from(document.querySelectorAll("dialog")).filter(isModal).at(-1) ?? document.body;
}

/**
 * Where a popup opened here goes: render `anchor` as a ref on an element in
 * place, and pass `container` to the Portal. It is `null` (the portal waits)
 * until the anchor has said where it is, and worked out again each time
 * `open` turns true (a new callback is a new ref to React).
 */
export function useLayer(open: boolean): { anchor: (element: HTMLElement | null) => void; container: HTMLElement | null } {
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const anchor = useCallback(
    (element: HTMLElement | null) => {
      if (element && open) setContainer(layerFor(element));
    },
    [open],
  );
  return { anchor, container };
}

export interface ModalProps {
  /** A confirmation: Base UI's AlertDialog (`role="alertdialog"`), which a press outside never closes. */
  alert?: boolean;
  /** Default true: mounted means open. HelpSheet stays mounted and passes its store's state. */
  open?: boolean;
  /** Escape, or (not for `alert`) a press on the backdrop. */
  onClose: () => void;
  /** False: nothing closes it but its own buttons (the session expired). */
  dismissible?: boolean;
  /** The popup's own look. */
  className: string;
  label?: string;
  labelledBy?: string;
  describedBy?: string;
  /** What takes focus on open, inside the popup. Default the first `[data-autofocus]`, else the first tabbable. */
  initialFocus?: string;
  onKeyDown?: (event: KeyboardEvent<HTMLDivElement>) => void;
  children: ReactNode;
}

export function Modal({
  alert = false,
  open = true,
  onClose,
  dismissible = true,
  className,
  label,
  labelledBy,
  describedBy,
  initialFocus = "[data-autofocus]",
  onKeyDown,
  children,
}: ModalProps) {
  const popupRef = useRef<HTMLDivElement>(null);
  const { anchor, container } = useLayer(open);

  const onOpenChange = (next: boolean, details: { reason: string; event: Event }) => {
    // An Escape a control inside already used (a field's own list) isn't the dialog's.
    if (next || !dismissible || (details.reason === "escape-key" && details.event.defaultPrevented)) return;
    onClose();
  };
  const popup = {
    ref: popupRef,
    className: `modal ${className}`,
    "aria-label": label,
    "aria-labelledby": labelledBy,
    "aria-describedby": describedBy,
    initialFocus: () => popupRef.current?.querySelector<HTMLElement>(initialFocus) ?? true,
    onKeyDown,
  };

  return alert ? (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <span hidden ref={anchor} />
      <AlertDialog.Portal container={container}>
        <AlertDialog.Backdrop className="modal-backdrop" />
        <AlertDialog.Popup {...popup}>{children}</AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  ) : (
    <Dialog.Root open={open} onOpenChange={onOpenChange} disablePointerDismissal={!dismissible}>
      <span hidden ref={anchor} />
      <Dialog.Portal container={container}>
        <Dialog.Backdrop className="modal-backdrop" />
        <Dialog.Popup {...popup}>{children}</Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
