// Brief 14 replaces this stub: the help sheet's open state, shared by the
// help button in the top bar, the `?` shortcut and the sheet itself.

import { createContext, createElement, useContext, useMemo, useState, type ReactNode } from "react";

export interface HelpSheetApi {
  isOpen: boolean;
  open(): void;
  close(): void;
}

const HelpSheetContext = createContext<HelpSheetApi | null>(null);

/** Wraps the shell. */
export function KeysProvider({ children }: { children: ReactNode }) {
  const [isOpen, setOpen] = useState(false);
  const api = useMemo<HelpSheetApi>(() => ({ isOpen, open: () => setOpen(true), close: () => setOpen(false) }), [isOpen]);
  return createElement(HelpSheetContext.Provider, { value: api }, children);
}

/** Open or close the keyboard-shortcut help sheet. */
export function useHelpSheet(): HelpSheetApi {
  const api = useContext(HelpSheetContext);
  if (!api) throw new Error("useHelpSheet must be used inside <KeysProvider> (the shell renders it)");
  return api;
}
