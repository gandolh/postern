// The top bar's status slot. Brief 11's LiveHost shows "Reconnecting…" there
// without touching the shell:
//
//   import { TopBarStatus } from "../shell/status";
//   <TopBarStatus><span role="status">Reconnecting…</span></TopBarStatus>
//
// TopBarStatus can be rendered anywhere under the shell; its children appear
// in the top bar, left of the help button. Several can be open at once; they
// sit side by side.

import { createContext, useContext, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

const SlotContext = createContext<HTMLElement | null>(null);
const SetSlotContext = createContext<((element: HTMLElement | null) => void) | null>(null);

/** Holds the slot element. The shell renders it around everything. */
export function StatusSlotProvider({ children }: { children: ReactNode }) {
  const [element, setElement] = useState<HTMLElement | null>(null);
  return (
    <SetSlotContext.Provider value={setElement}>
      <SlotContext.Provider value={element}>{children}</SlotContext.Provider>
    </SetSlotContext.Provider>
  );
}

/** Where the status goes: the shell puts this in the top bar. */
export function StatusSlot() {
  const setElement = useContext(SetSlotContext);
  return <div ref={setElement} className="shell-status-slot" />;
}

/** Shows its children in the top bar's status slot. */
export function TopBarStatus({ children }: { children: ReactNode }) {
  const element = useContext(SlotContext);
  return element ? createPortal(children, element) : null;
}
