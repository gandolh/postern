// How many whole rows the list shows on the first screen, at four sizes (the redesign's report: 9 at 1280x800,
// 8 at 390x844). It prints the counts and asserts only that a screenful is there.

import { expect, test } from "@playwright/test";
import { openDesk } from "./stub.ts";

for (const [width, height] of [
  [1280, 800],
  [1440, 900],
  [390, 844],
  [360, 800],
] as const) {
  test(`whole rows at ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await openDesk(page);
    await page.goto("/#inbox");
    await page.locator("[data-row-id]").first().waitFor();
    await page.waitForTimeout(300);
    const whole = await page.evaluate(() => {
      const body = document.querySelector("[data-testid=list-body]") as HTMLElement;
      const top = body.getBoundingClientRect().top;
      // The phone's bottom bar and Compose cover the foot of the list: count what is above them.
      const bar = document.querySelector("nav[aria-label='Mail shortcuts']")?.getBoundingClientRect().top;
      const bottom = Math.min(body.getBoundingClientRect().bottom, bar ?? Infinity);
      return Array.from(document.querySelectorAll("[data-row-id]")).filter((row) => {
        const r = row.getBoundingClientRect();
        return r.top >= top - 1 && r.bottom <= bottom + 1;
      }).length;
    });
    test.info().annotations.push({ type: "rows", description: String(whole) });
    console.log(`${width}x${height}: ${whole} whole rows`);
    expect(whole).toBeGreaterThan(3);
  });
}
