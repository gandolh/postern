// Display settings: theme, density and reading pane. They belong to the
// device, not the account, so they live in one module-level store that
// outlasts sign-out. Nothing here is persisted: brief 12 (web/src/prefs/**)
// restores saved values with setDisplaySettings() when its module loads, and
// saves them with subscribeDisplaySettings().
//
//   getDisplaySettings()             the current values
//   setDisplaySettings(partial)      change one or more; listeners run once
//   setTheme / setDensity / setReadingPane
//   subscribeDisplaySettings(fn)     fn(settings) after each change; returns unsubscribe
//   useDisplaySettings() / useTheme() in React (useTheme.ts)

/** The theme the user picked. `system` follows the operating system, live. */
export type ThemePreference = "system" | "light" | "dark";
/** The theme in effect. */
export type ResolvedTheme = "light" | "dark";
/** Gmail's three densities: default leaves room for attachment chips, compact is tightest. */
export type Density = "default" | "comfortable" | "compact";
/** Where an open conversation shows: full width (`none`), right of the list, or below it. */
export type ReadingPane = "none" | "right" | "below";

export interface DisplaySettings {
  theme: ThemePreference;
  density: Density;
  readingPane: ReadingPane;
}

export const THEMES: readonly ThemePreference[] = ["system", "light", "dark"];
export const DENSITIES: readonly Density[] = ["default", "comfortable", "compact"];
export const READING_PANES: readonly ReadingPane[] = ["none", "right", "below"];

export const DEFAULT_DISPLAY_SETTINGS: Readonly<DisplaySettings> = Object.freeze({
  theme: "system",
  density: "default",
  readingPane: "none",
});

let current: DisplaySettings = { ...DEFAULT_DISPLAY_SETTINGS };
const listeners = new Set<(settings: DisplaySettings) => void>();

/** The current display settings (a new object after each change, so React can compare). */
export function getDisplaySettings(): DisplaySettings {
  return current;
}

/**
 * Change one or more settings. Unknown values are ignored, so restoring a
 * saved blob from an older version cannot break the app.
 */
export function setDisplaySettings(patch: Partial<DisplaySettings>): void {
  const next: DisplaySettings = {
    theme: patch.theme !== undefined && THEMES.includes(patch.theme) ? patch.theme : current.theme,
    density: patch.density !== undefined && DENSITIES.includes(patch.density) ? patch.density : current.density,
    readingPane:
      patch.readingPane !== undefined && READING_PANES.includes(patch.readingPane) ? patch.readingPane : current.readingPane,
  };
  if (next.theme === current.theme && next.density === current.density && next.readingPane === current.readingPane) return;
  current = next;
  for (const listener of [...listeners]) listener(current);
}

export function setTheme(theme: ThemePreference): void {
  setDisplaySettings({ theme });
}

export function setDensity(density: Density): void {
  setDisplaySettings({ density });
}

export function setReadingPane(readingPane: ReadingPane): void {
  setDisplaySettings({ readingPane });
}

/** Call `listener` after every change. Returns the unsubscribe function. */
export function subscribeDisplaySettings(listener: (settings: DisplaySettings) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** For tests: back to the defaults, listeners kept. */
export function resetDisplaySettings(): void {
  setDisplaySettings(DEFAULT_DISPLAY_SETTINGS);
}

// ---- The system colour scheme --------------------------------------------

const DARK_QUERY = "(prefers-color-scheme: dark)";

function darkQuery(): MediaQueryList | null {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia(DARK_QUERY) : null;
}

/** The operating system's scheme right now. */
export function getSystemTheme(): ResolvedTheme {
  return darkQuery()?.matches ? "dark" : "light";
}

/** Call `listener` when the operating system's scheme changes. */
export function subscribeSystemTheme(listener: () => void): () => void {
  const query = darkQuery();
  if (!query) return () => {};
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
}

/** The theme in effect for a preference. */
export function resolveTheme(theme: ThemePreference, system: ResolvedTheme = getSystemTheme()): ResolvedTheme {
  return theme === "system" ? system : theme;
}
