// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { forgetLabelPrefs, getLabelPref, getLabelPrefs, resetLabelPrefsCache, setLabelPref, storageKey, subscribeLabelPrefs } from "./labelPrefs";

const USER = "alice@postern.test";

beforeEach(() => {
  window.localStorage.clear();
  resetLabelPrefsCache();
});
afterEach(() => vi.restoreAllMocks());

describe("labelPrefs", () => {
  it("keeps a colour and show-if-unread per account in localStorage", () => {
    setLabelPref(USER, "w", { color: "blue", showIfUnread: true });
    setLabelPref("bob@postern.test", "w", { color: "red" });
    expect(JSON.parse(window.localStorage.getItem(storageKey(USER))!)).toEqual({ w: { color: "blue", showIfUnread: true } });
    expect(getLabelPref("bob@postern.test", "w")).toEqual({ color: "red" });
    expect(storageKey(USER)).toBe("postern:alice@postern.test:labels");
  });

  it("survives a reload (the cache dropped, storage read again)", () => {
    setLabelPref(USER, "w", { color: "green" });
    resetLabelPrefsCache();
    expect(getLabelPref(USER, "w")).toEqual({ color: "green" });
  });

  it("clears a colour with null and drops an empty entry", () => {
    setLabelPref(USER, "w", { color: "green" });
    setLabelPref(USER, "w", { color: null });
    expect(getLabelPrefs(USER)).toEqual({});
    setLabelPref(USER, "w", { showIfUnread: true });
    setLabelPref(USER, "w", { showIfUnread: false });
    expect(getLabelPrefs(USER)).toEqual({});
  });

  it("ignores a colour that is not in the palette", () => {
    setLabelPref(USER, "w", { color: "chartreuse" as never });
    expect(getLabelPrefs(USER)).toEqual({});
  });

  it("returns the same object until something changes, and tells subscribers", () => {
    const listener = vi.fn();
    const off = subscribeLabelPrefs(listener);
    const before = getLabelPrefs(USER);
    expect(getLabelPrefs(USER)).toBe(before);
    setLabelPref(USER, "w", { color: "pink" });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(getLabelPrefs(USER)).not.toBe(before);
    off();
    forgetLabelPrefs(USER, "w");
    expect(listener).toHaveBeenCalledTimes(1);
    expect(getLabelPrefs(USER)).toEqual({});
  });

  it("reads corrupt storage as empty", () => {
    window.localStorage.setItem(storageKey(USER), "{not json");
    expect(getLabelPrefs(USER)).toEqual({});
    resetLabelPrefsCache();
    window.localStorage.setItem(storageKey(USER), JSON.stringify({ w: { color: "nope" }, x: 5, y: { color: "teal" } }));
    expect(getLabelPrefs(USER)).toEqual({ y: { color: "teal" } });
  });

  it("still works, in memory, when storage is blocked", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    expect(getLabelPrefs(USER)).toEqual({});
    expect(() => setLabelPref(USER, "w", { color: "orange" })).not.toThrow();
    expect(getLabelPref(USER, "w")).toEqual({ color: "orange" });
  });
});
