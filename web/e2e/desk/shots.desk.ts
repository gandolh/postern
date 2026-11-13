// Screenshots of every screen at 1280x800 and 390x844, light and dark. `SHOTS_DIR=<dir> npx playwright test shots`.

import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "@playwright/test";
import { hashOf, SCREENS, THEMES, WIDTHS } from "./screens.ts";
import { openDesk } from "./stub.ts";

const DIR = process.env["SHOTS_DIR"];

for (const theme of THEMES) {
  for (const size of WIDTHS) {
    test(`shots ${theme} ${size.label}`, async ({ page }) => {
      test.skip(!DIR, "set SHOTS_DIR");
      mkdirSync(DIR as string, { recursive: true });
      await page.setViewportSize({ width: size.width, height: size.height });
      await page.addInitScript((t) => {
        localStorage.setItem(
          "postern.display",
          JSON.stringify({ version: 1, theme: t, density: "default", readingPane: "right" }),
        );
      }, theme);
      const desk = await openDesk(page);
      for (const screen of SCREENS) {
        await page.goto("about:blank"); // a fresh page: the composer and menus of the last screen stay behind
        await page.goto(`/${hashOf(screen, desk)}`);
        await screen.ready(page);
        await screen.after?.(page);
        await page.waitForTimeout(300);
        await page.screenshot({ path: join(DIR as string, `${screen.name}-${theme}-${size.label}.png`) });
      }
      test.info().annotations.push({ type: "unhandled", description: desk.unhandled.join(", ") });
    });
  }
}

test("shots sign-in", async ({ page }) => {
  test.skip(!DIR, "set SHOTS_DIR");
  mkdirSync(DIR as string, { recursive: true });
  for (const theme of THEMES) {
    for (const size of WIDTHS) {
      await page.setViewportSize({ width: size.width, height: size.height });
      await page.addInitScript((t) => {
        localStorage.setItem(
          "postern.display",
          JSON.stringify({ version: 1, theme: t, density: "default", readingPane: "right" }),
        );
      }, theme);
      await openDesk(page, { signedIn: false });
      await page.goto("/");
      await page.locator("input[name=username]").waitFor();
      await page.screenshot({ path: join(DIR as string, `sign-in-${theme}-${size.label}.png`) });
    }
  }
});
