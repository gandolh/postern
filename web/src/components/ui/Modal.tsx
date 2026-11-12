// The modal dialogs' shared shape: Base UI's Dialog, or its
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
import { createContext, useCallback, useContext, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "../../lib/cn";

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
export function useLayer(open: boolean): {
  anchor: (element: HTMLElement | null) => void;
  container: HTMLElement | null;
} {
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
  /** A press outside doesn't close it; Escape and its own buttons still do. For a dialog people type into. */
  disablePointerDismissal?: boolean;
  /** The popup's own look. */
  className: string;
  /** The id of the text that describes it. Its name is its `Modal.Title`. */
  describedBy?: string;
  /** What takes focus on open, inside the popup. Default the first `[data-autofocus]`, else the first tabbable. */
  initialFocus?: string;
  onKeyDown?: (event: KeyboardEvent<HTMLDivElement>) => void;
  children: ReactNode;
}

/**
 * What the browser gave a modal <dialog> before Base UI: fixed in the middle of the window at its own size, over the
 * whole app (the docked composer, the toasts and the menus included). `className` goes after it, so a dialog's own
 * look wins.
 */
const POPUP =
  "fixed inset-0 z-modal m-auto h-fit max-h-[calc(100%-6px-2em)] w-fit max-w-[calc(100%-6px-2em)] overflow-auto outline-none";

export function Modal({
  alert = false,
  open = true,
  onClose,
  dismissible = true,
  disablePointerDismissal = false,
  className,
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
    className: cn(POPUP, className),
    // Left out when unset, so it can't override what Base UI sets.
    ...(describedBy ? { "aria-describedby": describedBy } : {}),
    initialFocus: () => popupRef.current?.querySelector<HTMLElement>(initialFocus) ?? true,
    onKeyDown,
  };

  return alert ? (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <span hidden ref={anchor} />
      <AlertDialog.Portal container={container}>
        <AlertDialog.Backdrop className="fixed inset-0 z-modal bg-scrim" />
        <AlertDialog.Popup {...popup}>
          <AlertContext.Provider value={true}>{children}</AlertContext.Provider>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  ) : (
    <Dialog.Root
      open={open}
      onOpenChange={onOpenChange}
      disablePointerDismissal={!dismissible || disablePointerDismissal}
    >
      <span hidden ref={anchor} />
      <Dialog.Portal container={container}>
        <Dialog.Backdrop className="fixed inset-0 z-modal bg-scrim" />
        <Dialog.Popup {...popup}>
          <AlertContext.Provider value={false}>{children}</AlertContext.Provider>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

const AlertContext = createContext(false);

/** The dialog's title: it names the popup (`aria-labelledby`), as a heading. A hidden one goes in `className="sr-only"`. */
function ModalTitle({ className, children }: { className?: string; children: ReactNode }) {
  const Title = useContext(AlertContext) ? AlertDialog.Title : Dialog.Title;
  return <Title className={className}>{children}</Title>;
}

Modal.Title = ModalTitle;
