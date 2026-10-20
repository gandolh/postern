// React access to the display settings (displaySettings.ts).

import { useSyncExternalStore } from "react";
import {
  getDisplaySettings,
  getSystemTheme,
  resolveTheme,
  setDensity,
  setReadingPane,
  setTheme,
  subscribeDisplaySettings,
  subscribeSystemTheme,
  type DisplaySettings,
  type ResolvedTheme,
} from "./displaySettings";

export interface ThemeState extends DisplaySettings {
  /** `theme` with `system` resolved; follows the operating system live. */
  resolvedTheme: ResolvedTheme;
  setTheme: typeof setTheme;
  setDensity: typeof setDensity;
  setReadingPane: typeof setReadingPane;
}

/** The display settings, re-rendering on change. */
export function useDisplaySettings(): DisplaySettings {
  return useSyncExternalStore(subscribeDisplaySettings, getDisplaySettings, getDisplaySettings);
}

/** The operating system's scheme, re-rendering when it changes. */
export function useSystemTheme(): ResolvedTheme {
  return useSyncExternalStore(subscribeSystemTheme, getSystemTheme, () => "light" as const);
}

/** Theme, density and reading pane, the resolved theme, and their setters. */
export function useTheme(): ThemeState {
  const settings = useDisplaySettings();
  const system = useSystemTheme();
  return { ...settings, resolvedTheme: resolveTheme(settings.theme, system), setTheme, setDensity, setReadingPane };
}
