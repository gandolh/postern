// The one toast system: "Conversation archived. Undo" (brief 06), "Message
// sent. Undo" (brief 08). One toast at a time, as in Gmail; a new one
// replaces the old. It sits bottom-left inside a polite live region that is
// always in the page, so screen readers announce it.
//
//   const toast = useToast();
//   const handle = toast.show({ message: "Conversation archived.", action: { label: "Undo", onClick: undo } });
//   handle.dismiss();
//
// The timer pauses while the pointer is over the toast or focus is in it.

import { X } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastOptions {
  message: string;
  /** One action button, e.g. Undo. Clicking it runs `onClick` and closes the toast. */
  action?: ToastAction;
  /** How long it stays, in ms. Default 8000. `null` stays until dismissed. */
  duration?: number | null;
}

export interface ToastHandle {
  /** Close this toast, if it is still the one showing. */
  dismiss(): void;
}

export interface ToastApi {
  show(options: ToastOptions): ToastHandle;
  /** Close whatever toast is showing. */
  dismiss(): void;
}

export const DEFAULT_TOAST_DURATION = 8000;

interface Current extends ToastOptions {
  id: number;
}

const ToastContext = createContext<ToastApi | null>(null);

/** The toast API. Must be under the shell (or a ToastProvider in tests). */
export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error("useToast must be used inside <ToastProvider> (the shell renders it)");
  return api;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<Current | null>(null);
  const nextId = useRef(1);

  const dismiss = useCallback(() => setCurrent(null), []);
  const close = useCallback((id: number) => setCurrent((c) => (c?.id === id ? null : c)), []);
  const show = useCallback(
    (options: ToastOptions): ToastHandle => {
      const id = nextId.current++;
      setCurrent({ ...options, id });
      return { dismiss: () => close(id) };
    },
    [close],
  );
  const api = useMemo<ToastApi>(() => ({ show, dismiss }), [show, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="shell-toast-region" role="status" aria-live="polite" aria-atomic="true">
        {current ? <Toast key={current.id} toast={current} onClose={close} /> : null}
      </div>
    </ToastContext.Provider>
  );
}

function Toast({ toast, onClose: close }: { toast: Current; onClose: (id: number) => void }) {
  const [paused, setPaused] = useState(false);
  const duration = toast.duration === undefined ? DEFAULT_TOAST_DURATION : toast.duration;
  const { id } = toast;
  const onClose = useCallback(() => close(id), [close, id]);

  useEffect(() => {
    if (duration === null || paused) return;
    const timer = window.setTimeout(onClose, duration);
    return () => window.clearTimeout(timer);
  }, [duration, paused, onClose]);

  return (
    <div
      className="shell-toast"
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setPaused(false);
      }}
    >
      <p className="shell-toast-message">{toast.message}</p>
      {toast.action ? (
        <button
          type="button"
          className="shell-toast-action"
          onClick={() => {
            toast.action?.onClick();
            onClose();
          }}
        >
          {toast.action.label}
        </button>
      ) : null}
      <button type="button" className="shell-toast-close" aria-label="Dismiss" onClick={onClose}>
        <X aria-hidden="true" />
      </button>
    </div>
  );
}
