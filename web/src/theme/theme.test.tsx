// @vitest-environment jsdom
// The theme choice: light on a first visit, Light / Dark / System in that order, and the attribute on <html>
// that color-scheme follows (styles/index.css). What the attribute does to the colours is proved in a browser,
// against the build (e2e/theme.spec.ts): jsdom has no color-scheme and does not run the stylesheet.

import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadDisplaySettings } from "../prefs/display";
import { ThemeProvider } from "./ThemeProvider";
import {
  DEFAULT_DISPLAY_SETTINGS,
  THEMES,
  getDisplaySettings,
  resetDisplaySettings,
  setDisplaySettings,
  setTheme,
} from "./displaySettings";

beforeEach(() => {
  localStorage.clear();
  resetDisplaySettings();
});

afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute("data-theme");
});

describe("the theme choice", () => {
  it("is light on a first visit, whatever the system prefers", () => {
    window.matchMedia = (query: string) => ({ matches: query.includes("dark"), media: query }) as MediaQueryList;
    expect(DEFAULT_DISPLAY_SETTINGS.theme).toBe("light");
    expect(getDisplaySettings().theme).toBe("light");
    render(<ThemeProvider>x</ThemeProvider>);
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  it("offers Light, Dark and System, in that order", () => {
    expect(THEMES).toEqual(["light", "dark", "system"]);
  });

  it("puts each choice on <html>, which the stylesheet's color-scheme follows", () => {
    render(<ThemeProvider>x</ThemeProvider>);
    for (const theme of THEMES) {
      act(() => setTheme(theme));
      expect(document.documentElement.getAttribute("data-theme")).toBe(theme);
    }
    act(() => setTheme("dark"));
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    act(() => setTheme("system"));
    expect(document.documentElement.getAttribute("data-theme")).toBe("system");
  });

  it("keeps a stored choice: restoring it is never overwritten by the default", () => {
    localStorage.setItem(
      "postern.display",
      JSON.stringify({ version: 1, theme: "dark", density: "default", readingPane: "none" }),
    );
    setDisplaySettings(loadDisplaySettings());
    expect(getDisplaySettings().theme).toBe("dark");
  });
});
