// The theme choice on the production build: Light and Dark pin the root's color-scheme, System follows the
// operating system live, a first visit is light under a dark OS, and a kept choice is on the page before the
// first paint. The sign-in page is enough: the theme is on <html>, and the colours resolve from it.
// (lightningcss rewrites light-dark() at build time, so this runs against the build, not in jsdom.)

import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { APP_URL } from "./lib/env.ts";

const KEY = "postern.display";

const scheme = (page: Page) => page.evaluate(() => getComputedStyle(document.documentElement).colorScheme);
const canvas = (page: Page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);

const LIGHT_CANVAS = "rgb(232, 235, 231)";
const DARK_CANVAS = "rgb(13, 17, 15)";

async function keepChoice(context: BrowserContext, theme: string): Promise<void> {
  await context.addInitScript(
    ([key, value]) => {
      if (!sessionStorage.getItem("theme-spec-seeded")) {
        localStorage.setItem(
          key,
          JSON.stringify({ version: 1, theme: value, density: "default", readingPane: "none" }),
        );
        sessionStorage.setItem("theme-spec-seeded", "1");
      }
    },
    [KEY, theme] as const,
  );
}

test.describe("under a dark operating system", () => {
  test.use({ colorScheme: "dark" });

  test("a first visit shows the light theme", async ({ page }) => {
    await page.goto(APP_URL);
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    expect(await scheme(page)).toBe("light");
    expect(await canvas(page)).toBe(LIGHT_CANVAS);
  });

  test("Dark pins the scheme, and a kept choice is on the page before the first paint", async ({ page, context }) => {
    await keepChoice(context, "dark");
    await page.addInitScript(() => {
      const seen: string[] = [];
      (window as unknown as { __themes: string[] }).__themes = seen;
      // Observed from the document, which exists before <html> does.
      new MutationObserver((records) => {
        for (const record of records) seen.push((record.target as HTMLElement).dataset["theme"] ?? "");
      }).observe(document, { attributes: true, subtree: true, attributeFilter: ["data-theme"] });
    });
    await page.goto(APP_URL);
    await expect(page.locator("input[name=username]")).toBeVisible();
    expect(await scheme(page)).toBe("dark");
    expect(await canvas(page)).toBe(DARK_CANVAS);
    const seen = await page.evaluate(() => (window as unknown as { __themes: string[] }).__themes);
    expect(seen[0], "the first value on <html>").toBe("dark");
    expect(seen.filter((value) => value !== "dark")).toEqual([]);
    await page.reload();
    expect(await scheme(page)).toBe("dark");
  });

  test("System follows the operating system, live", async ({ page, context }) => {
    await keepChoice(context, "system");
    await page.goto(APP_URL);
    await expect(page.locator("html")).toHaveAttribute("data-theme", "system");
    expect(await scheme(page)).toBe("light dark");
    expect(await canvas(page)).toBe(DARK_CANVAS);
    await page.emulateMedia({ colorScheme: "light" });
    expect(await canvas(page)).toBe(LIGHT_CANVAS);
    await page.emulateMedia({ colorScheme: "dark" });
    expect(await canvas(page)).toBe(DARK_CANVAS);
  });
});

test.describe("under a light operating system", () => {
  test.use({ colorScheme: "light" });

  test("Light pins the scheme against a dark preference", async ({ page, context }) => {
    await keepChoice(context, "light");
    await page.goto(APP_URL);
    expect(await scheme(page)).toBe("light");
    await page.emulateMedia({ colorScheme: "dark" });
    expect(await canvas(page)).toBe(LIGHT_CANVAS);
  });
});
