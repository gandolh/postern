// The visual system: tokens, fonts, theme, density, reading pane.
//
//   main.tsx loads styles/index.css once, the app's one stylesheet.
//   <ThemeProvider>                      sets data-theme / data-density / data-reading-pane on <html>
//   useTheme()                           { theme, density, readingPane, resolvedTheme, setTheme, setDensity, setReadingPane }
//   setDisplaySettings(partial), subscribeDisplaySettings(fn)   for the per-device prefs, outside React

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
