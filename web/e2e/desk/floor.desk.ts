// The Floor, on every screen in the table: a visible focus ring on every Tab stop, no running animation or
// transition under reduced motion, and no sideways scroll at 390 px. All against the stub (stub.ts).

import { expect, test, type Page } from "@playwright/test";
import { hashOf, SCREENS, type Screen } from "./screens.ts";
import { openDesk, type Desk } from "./stub.ts";

async function open(page: Page, screen: Screen): Promise<Desk> {
  const desk = await openDesk(page);
  await page.goto(`/${hashOf(screen, desk)}`);
  await screen.ready(page);
  await screen.after?.(page);
  await page.waitForTimeout(250);
  return desk;
}

test.describe("at 390 px", () => {
  test.use({ viewport: { width: 390, height: 844 } });
  for (const screen of SCREENS) {
    test(`${screen.name} has no sideways scroll`, async ({ page }) => {
      const desk = await open(page, screen);
      const widths = await page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        inner: window.innerWidth,
      }));
      expect(widths.scroll).toBeLessThanOrEqual(widths.inner);
      expect(desk.unhandled).toEqual([]);
    });
  }
});

test.describe("under reduced motion", () => {
  test.use({ reducedMotion: "reduce", viewport: { width: 1280, height: 800 } });
  for (const screen of SCREENS) {
    test(`${screen.name} runs no animation or transition`, async ({ page }) => {
      await open(page, screen);
      await page.waitForTimeout(300);
      const running = await page.evaluate(() =>
        document
          .getAnimations()
          .filter((a) => a.playState === "running" && Number(a.effect?.getComputedTiming().duration ?? 0) > 0)
          .map(
            (a) =>
              `${a.constructor.name} ${(a as CSSTransition).transitionProperty ?? (a as CSSAnimation).animationName ?? ""}`,
          ),
      );
      expect(running).toEqual([]);
    });
  }
});

/**
 * Whether the focused element draws a ring: its own outline, or the outline or inset shadow of a wrapper that
 * holds it (the search pill and a composer field draw theirs on the wrapper). A drop shadow never counts.
 */
const RING = () => {
  const draws = (el: Element): boolean => {
    const style = getComputedStyle(el);
    const outline =
      style.outlineStyle !== "none" && parseFloat(style.outlineWidth) >= 2 && style.outlineColor !== "rgba(0, 0, 0, 0)";
    return outline || style.boxShadow.includes("inset");
  };
  const el = document.activeElement;
  if (!el || el === document.body) return { skip: true, name: "", ring: true };
  let ring = draws(el);
  for (let up: Element | null = el.parentElement, n = 0; !ring && up && n < 3; up = up.parentElement, n++)
    ring = draws(up);
  const label = el.getAttribute("aria-label");
  const name = `${el.tagName.toLowerCase()}${label ? `[${label}]` : ""}${el.textContent ? ` "${el.textContent.trim().slice(0, 24)}"` : ""}`;
  return { skip: false, name, ring };
};

test.describe("keyboard focus", () => {
  test.use({ viewport: { width: 1280, height: 800 } });
  for (const screen of SCREENS) {
    test(`${screen.name}: every Tab stop shows a ring`, async ({ page }) => {
      await open(page, screen);
      await page.locator("body").press("Tab");
      const missing: string[] = [];
      for (let i = 0; i < 30; i++) {
        await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
        const stop = await page.evaluate(RING);
        if (!stop.skip && !stop.ring) missing.push(stop.name);
        await page.keyboard.press("Tab");
      }
      expect(missing).toEqual([]);
    });
  }
});
