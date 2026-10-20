// <ThemeProvider>: puts the display settings on <html> as `data-theme` and
// `data-density` (tokens.css keys off them), and gives every icon the house
// size and stroke. It wraps the whole app, the sign-in page included.
//
// `data-theme` is the preference (system | light | dark). With `system`,
// tokens.css follows prefers-color-scheme by itself, so the switch is live
// and needs no script; `useTheme().resolvedTheme` follows it too, for code
// that must know (the message frame in brief 07).

import { LucideProvider } from "lucide-react";
import { useLayoutEffect, type ReactNode } from "react";
import { useDisplaySettings } from "./useTheme";

export interface ThemeProviderProps {
  children: ReactNode;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  const { theme, density, readingPane } = useDisplaySettings();

  useLayoutEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-theme", theme);
    root.setAttribute("data-density", density);
    root.setAttribute("data-reading-pane", readingPane);
  }, [theme, density, readingPane]);

  return (
    <LucideProvider size={20} strokeWidth={1.75}>
      {children}
    </LucideProvider>
  );
}
