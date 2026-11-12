// The one toast system, on Base UI's Toast: "Conversation archived. Undo",
// "Message sent. Undo". One toast at a time, as in Gmail; a new one replaces
// the old. It sits bottom-left in the toast viewport, a polite live region that
// is always in the page, so screen readers announce it. F6 moves keyboard
// focus into it.
//
//   const toast = useToast();
//   const handle = toast.show({ message: "Conversation archived.", action: { label: "Undo", onClick: undo } });
//   handle.dismiss();
//
// The timer pauses while the pointer is over the toast or focus is in it.

import { Toast } from "@base-ui/react/toast";
import { X } from "lucide-react";
import { createContext, useContext, useMemo, type ReactNode } from "react";

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

const ToastContext = createContext<ToastApi | null>(null);

/** The toast API. Must be under the shell (or a ToastProvider in tests). */
export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error("useToast must be used inside <ToastProvider> (the shell renders it)");
  return api;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  return (
    <Toast.Provider limit={1} timeout={DEFAULT_TOAST_DURATION}>
      <ToastApiProvider>{children}</ToastApiProvider>
      <Toast.Portal>
        <Toast.Viewport className="fixed bottom-6 left-6 z-popup max-sm:right-2 max-sm:bottom-2 max-sm:left-2 max-sm:[body:has([data-compose-fab])_&]:bottom-[calc(5rem+env(safe-area-inset-bottom,0px))]">
          <ToastList />
        </Toast.Viewport>
      </Toast.Portal>
    </Toast.Provider>
  );
}

function ToastApiProvider({ children }: { children: ReactNode }) {
  const manager = Toast.useToastManager();
  const { add, close } = manager;

  const api = useMemo<ToastApi>(
    () => ({
      show: ({ message, action, duration }) => {
        // One at a time: the new toast replaces the one showing.
        close();
        const id = add({
          title: message,
          // Base UI: 0 keeps it until dismissed.
          timeout: duration === undefined ? DEFAULT_TOAST_DURATION : (duration ?? 0),
          actionProps: action
            ? {
                children: action.label,
                onClick: () => {
                  action.onClick();
                  close(id);
                },
              }
            : undefined,
        });
        return { dismiss: () => close(id) };
      },
      dismiss: () => close(),
    }),
    [add, close],
  );

  return <ToastContext.Provider value={api}>{children}</ToastContext.Provider>;
}

function ToastList() {
  const { toasts } = Toast.useToastManager();
  return toasts.map((toast) => (
    <Toast.Root
      key={toast.id}
      toast={toast}
      className="flex min-h-12 max-w-[min(36rem,calc(100vw-3rem))] items-center gap-1 rounded-md bg-inverse py-1 pr-1 pl-4 text-on-inverse shadow-lg motion-safe:animate-toast-in [&_:focus-visible]:outline-inverse-accent"
    >
      <Toast.Title render={<p />} className="flex-[1_1_auto] pr-3" />
      <Toast.Action className="min-h-9 flex-none cursor-pointer rounded-sm bg-transparent px-3 font-bold text-inverse-accent hover:bg-on-inverse/12" />
      <Toast.Close
        className="grid size-9 flex-none cursor-pointer place-items-center rounded-sm bg-transparent text-on-inverse hover:bg-on-inverse/12"
        aria-label="Dismiss"
      >
        <X aria-hidden="true" />
      </Toast.Close>
    </Toast.Root>
  ));
}
