// The visual system (brief 05): tokens, fonts, theme, density, reading pane.
//
//   import "./theme/fonts"; import "./theme/tokens.css"; import "./theme/base.css";  (main.tsx does this once)
//   <ThemeProvider>                      sets data-theme / data-density / data-reading-pane on <html>
//   useTheme()                           { theme, density, readingPane, resolvedTheme, setTheme, setDensity, setReadingPane }
//   setDisplaySettings(partial), subscribeDisplaySettings(fn)   for brief 12's per-device prefs, outside React

export { ThemeProvider, type ThemeProviderProps } from "./ThemeProvider";
export { useTheme, useDisplaySettings, useSystemTheme, type ThemeState } from "./useTheme";
export {
  DEFAULT_DISPLAY_SETTINGS,
  DENSITIES,
  READING_PANES,
  THEMES,
  getDisplaySettings,
  getSystemTheme,
  resolveTheme,
  setDensity,
  setDisplaySettings,
  setReadingPane,
  setTheme,
  subscribeDisplaySettings,
  type Density,
  type DisplaySettings,
  type ReadingPane,
  type ResolvedTheme,
  type ThemePreference,
} from "./displaySettings";
