// The phone navigation drawer (Base UI's Drawer): it opens from the menu button
// and takes focus; Escape, a swipe to the left, a press on the backdrop and a
// link press close it; focus returns to the menu button. Touch input goes through
// the DevTools protocol, as a phone's would.

import { expect, test, type Page } from "@playwright/test";
import { goTo, signIn, stubOutsideWorld } from "./lib/app.ts";

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

test.beforeEach(async ({ context }) => {
  await stubOutsideWorld(context);
});

async function swipeLeft(page: Page, y: number): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  const touch = (type: "touchStart" | "touchMove" | "touchEnd", x: number) =>
    cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y }] });
  await touch("touchStart", 200);
  for (let step = 1; step <= 8; step++) {
    await touch("touchMove", 200 - step * 22);
    await page.waitForTimeout(16);
  }
  await touch("touchEnd", 0);
}

test("the navigation drawer opens, takes focus, and closes four ways with focus back on the menu button", async ({
  page,
}) => {
  await signIn(page);
  await goTo(page, "#inbox");
  const menu = page.getByRole("button", { name: "Main menu" });
  const drawer = page.getByRole("dialog", { name: "Navigation" });
  await expect(page.getByRole("grid", { name: "Conversations in Inbox" })).toBeVisible();

  // Open: focus goes to the first control inside, Compose.
  await menu.click();
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole("button", { name: "Compose" })).toBeFocused();
  await expect(drawer.getByRole("link", { name: /^Starred/ })).toBeVisible();

  // Escape.
  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();
  await expect(menu).toBeFocused();

  // A swipe to the left.
  await menu.click();
  await expect(drawer).toBeVisible();
  await swipeLeft(page, 400);
  await expect(drawer).toBeHidden();
  await expect(menu).toBeFocused();

  // A press on the backdrop, to the right of the panel.
  await menu.click();
  await expect(drawer).toBeVisible();
  await page.mouse.click(340, 400);
  await expect(drawer).toBeHidden();
  await expect(menu).toBeFocused();

  // A link press closes it and goes there.
  await menu.click();
  await drawer.getByRole("link", { name: /^Starred/ }).click();
  await expect(drawer).toBeHidden();
  await expect(page).toHaveURL(/#starred/);
});

test("the drawer keeps the label tree folded and its scroll between openings", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 500 });
  await signIn(page);
  const menu = page.getByRole("button", { name: "Main menu" });
  const drawer = page.getByRole("dialog", { name: "Navigation" });

  await menu.click();
  await expect(drawer).toBeVisible();
  await drawer.getByRole("button", { name: "Work sublabels" }).click();
  await expect(drawer.getByRole("link", { name: /^Clients/ })).toBeHidden();
  const scroller = page.locator("[data-drawer-content]");
  await scroller.evaluate((element) => {
    element.scrollTop = 40;
  });
  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();

  await menu.click();
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole("link", { name: /^Clients/ })).toBeHidden();
  await expect.poll(() => scroller.evaluate((element) => element.scrollTop)).toBe(40);
});
