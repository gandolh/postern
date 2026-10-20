// @vitest-environment jsdom
// The per-device prefs: versioning, invalid values, blocked storage, the
// wiring into the undo-send delay and the image allowance, display persistence.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { allowsImagesFrom } from "../render/allowance";
import { getUndoSendDelay } from "../send/undoDelay";
import { resetDisplaySettings, getDisplaySettings, setTheme, setDensity } from "../theme/displaySettings";
import { DISPLAY_KEY, loadDisplaySettings, startDisplayPersistence } from "./display";
import { PREFS_VERSION, getPrefs, getShortcutsEnabled, getSwipeActions, normalise, resetPrefs, setPrefs, setPrefsAccount, startPrefs, subscribeShortcutsEnabled } from "./prefs";
import { clearMemory } from "./storage";

beforeEach(() => {
  localStorage.clear();
  clearMemory();
  resetPrefs();
});
afterEach(() => {
  vi.restoreAllMocks();
  resetPrefs();
});

describe("normalise", () => {
  it("falls back to defaults for another version, junk, and bad fields", () => {
    expect(normalise(null)).toEqual(getPrefs());
    expect(normalise({ version: 99, undoSendSeconds: 30 }).undoSendSeconds).toBe(5);
    expect(normalise("x").images).toBe("ask");
    const n = normalise({ version: PREFS_VERSION, undoSendSeconds: 7, images: "sometimes", shortcuts: "yes", defaultIdentityId: 4 });
    expect(n).toEqual({ undoSendSeconds: 5, images: "ask", shortcuts: true, defaultIdentityId: null, swipeLeft: "archive", swipeRight: "archive" });
  });
  it("keeps valid fields", () => {
    expect(normalise({ version: 1, undoSendSeconds: 20, images: "always", shortcuts: false, defaultIdentityId: "I2" })).toEqual({
      undoSendSeconds: 20,
      images: "always",
      shortcuts: false,
      defaultIdentityId: "I2",
      swipeLeft: "archive",
      swipeRight: "archive",
    });
  });
});

describe("swipe actions (brief 16)", () => {
  it("default to archive both ways, as Gmail's do", () => {
    expect(getSwipeActions()).toEqual({ left: "archive", right: "archive" });
  });
  it("keep a valid choice per direction and refuse anything else", () => {
    expect(normalise({ version: PREFS_VERSION, swipeLeft: "delete", swipeRight: "none" })).toMatchObject({ swipeLeft: "delete", swipeRight: "none" });
    expect(normalise({ version: PREFS_VERSION, swipeLeft: "explode", swipeRight: 3 })).toMatchObject({ swipeLeft: "archive", swipeRight: "archive" });
  });
  it("are saved per account and read at once", () => {
    setPrefsAccount("alice@postern.test");
    setPrefs({ swipeLeft: "read", swipeRight: "delete" });
    expect(getSwipeActions()).toEqual({ left: "read", right: "delete" });
    expect(JSON.parse(localStorage.getItem("postern.prefs.alice@postern.test")!)).toMatchObject({ swipeLeft: "read", swipeRight: "delete" });
    setPrefsAccount("bob@postern.test");
    expect(getSwipeActions()).toEqual({ left: "archive", right: "archive" });
    setPrefsAccount("alice@postern.test");
    expect(getSwipeActions()).toEqual({ left: "read", right: "delete" });
  });
});

describe("per account, per device", () => {
  it("saves under the account and loads it back", () => {
    setPrefsAccount("Alice@Postern.test");
    setPrefs({ undoSendSeconds: 20, shortcuts: false });
    expect(JSON.parse(localStorage.getItem("postern.prefs.alice@postern.test")!)).toMatchObject({ version: 1, undoSendSeconds: 20, shortcuts: false });
    setPrefsAccount("bob@postern.test");
    expect(getPrefs().undoSendSeconds).toBe(5);
    setPrefsAccount("alice@postern.test");
    expect(getPrefs().undoSendSeconds).toBe(20);
    expect(getShortcutsEnabled()).toBe(false);
  });
  it("ignores invalid values passed to setPrefs", () => {
    setPrefsAccount("alice@postern.test");
    setPrefs({ undoSendSeconds: 3 as never, images: "x" as never });
    expect(getPrefs().undoSendSeconds).toBe(5);
    expect(getPrefs().images).toBe("ask");
  });
  it("a reload picks up the account last seen, before sign-in", () => {
    setPrefsAccount("alice@postern.test");
    setPrefs({ undoSendSeconds: 30 });
    resetPrefs();
    expect(getUndoSendDelay()).toBe(5000);
    startPrefs();
    expect(getUndoSendDelay()).toBe(30_000);
  });
  it("notifies shortcut subscribers only when that value changes", () => {
    setPrefsAccount("alice@postern.test");
    const seen: boolean[] = [];
    const off = subscribeShortcutsEnabled((v) => seen.push(v));
    setPrefs({ undoSendSeconds: 10 });
    setPrefs({ shortcuts: false });
    off();
    setPrefs({ shortcuts: true });
    expect(seen).toEqual([false]);
  });
});

describe("wiring", () => {
  it("feeds the undo-send delay in ms", () => {
    setPrefsAccount("alice@postern.test");
    for (const s of [5, 10, 20, 30] as const) {
      setPrefs({ undoSendSeconds: s });
      expect(getUndoSendDelay()).toBe(s * 1000);
    }
  });
  it("images 'always' makes every sender allowed; 'ask' is the default", () => {
    setPrefsAccount("alice@postern.test");
    expect(allowsImagesFrom("alice@postern.test", "x@y.test")).toBe(false);
    setPrefs({ images: "always" });
    expect(allowsImagesFrom("alice@postern.test", "x@y.test")).toBe(true);
    setPrefs({ images: "ask" });
    expect(allowsImagesFrom("alice@postern.test", "x@y.test")).toBe(false);
  });
});

describe("blocked storage", () => {
  it("keeps working in memory when localStorage throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    setPrefsAccount("alice@postern.test");
    expect(() => setPrefs({ undoSendSeconds: 10 })).not.toThrow();
    expect(getPrefs().undoSendSeconds).toBe(10);
    setPrefsAccount("alice@postern.test");
    expect(getPrefs().undoSendSeconds).toBe(10);
  });
  it("treats corrupt JSON as defaults", () => {
    localStorage.setItem("postern.prefs.alice@postern.test", "{nope");
    setPrefsAccount("alice@postern.test");
    expect(getPrefs().undoSendSeconds).toBe(5);
  });
});

describe("display settings persistence", () => {
  afterEach(() => resetDisplaySettings());
  it("reads only a versioned blob and ignores unknown values", () => {
    expect(loadDisplaySettings()).toEqual({});
    localStorage.setItem(DISPLAY_KEY, JSON.stringify({ version: 2, theme: "dark" }));
    expect(loadDisplaySettings()).toEqual({});
    localStorage.setItem(DISPLAY_KEY, JSON.stringify({ version: 1, theme: "dark", density: "weird", readingPane: "right" }));
    startDisplayPersistence();
    expect(getDisplaySettings()).toEqual({ theme: "dark", density: "default", readingPane: "right" });
  });
  it("saves each later change", () => {
    startDisplayPersistence();
    setTheme("light");
    setDensity("compact");
    expect(JSON.parse(localStorage.getItem(DISPLAY_KEY)!)).toMatchObject({ version: 1, theme: "light", density: "compact" });
  });
});
