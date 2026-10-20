// Theme, density and reading pane persist here, device-wide (they apply before
// anyone signs in, so they are not keyed by account). The theme store itself
// (brief 05) holds no storage; this restores and saves it.

import { DEFAULT_DISPLAY_SETTINGS, getDisplaySettings, setDisplaySettings, subscribeDisplaySettings, type DisplaySettings } from "../theme/displaySettings";
import { isRecord, readRaw, writeRaw } from "./storage";

export const DISPLAY_KEY = "postern.display";
export const DISPLAY_VERSION = 1;

let started = false;

export function loadDisplaySettings(): Partial<DisplaySettings> {
  const raw = readRaw(DISPLAY_KEY);
  if (!isRecord(raw) || raw["version"] !== DISPLAY_VERSION) return {};
  // setDisplaySettings ignores values it does not know.
  return { theme: raw["theme"] as DisplaySettings["theme"], density: raw["density"] as DisplaySettings["density"], readingPane: raw["readingPane"] as DisplaySettings["readingPane"] };
}

export function saveDisplaySettings(settings: DisplaySettings = getDisplaySettings()): void {
  writeRaw(DISPLAY_KEY, { version: DISPLAY_VERSION, ...settings });
}

/** Restore the saved values and save every later change. Idempotent. */
export function startDisplayPersistence(): void {
  if (started) return;
  started = true;
  setDisplaySettings(loadDisplaySettings());
  subscribeDisplaySettings(saveDisplaySettings);
}

export { DEFAULT_DISPLAY_SETTINGS };
