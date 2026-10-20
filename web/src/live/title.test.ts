// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { createTabIndicators, faviconHref, faviconSvg, tabTitle } from "./title";

describe("tabTitle", () => {
  it("shows the Inbox unread count, or just the name at zero", () => {
    expect(tabTitle(3)).toBe("Inbox (3) — Postern");
    expect(tabTitle(0)).toBe("Postern");
  });
});

describe("favicon", () => {
  it("has a count dot only with unread mail, capped at 9+", () => {
    expect(faviconSvg(0)).not.toContain("<circle");
    expect(faviconSvg(4)).toContain(">4</text>");
    expect(faviconSvg(250)).toContain(">9+</text>");
  });
  it("is a data URL", () => {
    expect(faviconHref(2)).toMatch(/^data:image\/svg\+xml,%3Csvg/);
  });
});

describe("createTabIndicators", () => {
  afterEach(() => {
    document.head.innerHTML = "";
  });
  it("sets and restores the title and icon", () => {
    document.head.innerHTML = '<link rel="icon" href="/favicon.svg">';
    document.title = "Postern";
    const t = createTabIndicators();
    t.set(5);
    expect(document.title).toBe("Inbox (5) — Postern");
    expect(document.querySelector("link")!.getAttribute("href")).toMatch(/^data:/);
    t.set(0);
    expect(document.title).toBe("Postern");
    expect(document.querySelector("link")!.getAttribute("href")).toBe("/favicon.svg");
    t.set(2);
    t.restore();
    expect(document.title).toBe("Postern");
    expect(document.querySelector("link")!.getAttribute("href")).toBe("/favicon.svg");
  });
});
