// The settings that apply at once are switches: `role="switch"` with
// `aria-checked`, and Space toggles them. The two that live in this browser are
// turned over and back; the vacation responder and the notification switches
// are read only, since they write to the server or ask the browser for
// permission. Web Push shows only where the service worker runs, which this
// config blocks.

import { expect, test } from "@playwright/test";
import { goTo, signIn, stubOutsideWorld } from "./lib/app.ts";

test.beforeEach(async ({ context }) => {
  await stubOutsideWorld(context);
});

test("the settings switches report their state and toggle from the keyboard", async ({ page }) => {
  await signIn(page);
  await goTo(page, "#settings/general");

  const conversationView = page.getByRole("switch", { name: "Conversation view: group replies into one row" });
  const shortcuts = page.getByRole("switch", { name: "Keyboard shortcuts on" });
  const vacation = page.getByRole("switch", { name: "Vacation responder on" });

  for (const control of [conversationView, shortcuts]) {
    await expect(control).toHaveAttribute("aria-checked", "true");
    await control.focus();
    await page.keyboard.press("Space");
    await expect(control).toHaveAttribute("aria-checked", "false");
    await page.keyboard.press("Space");
    await expect(control).toHaveAttribute("aria-checked", "true");
  }

  await expect(vacation).toHaveAttribute("aria-checked", /^(true|false)$/);
  const notifications = page.getByRole("switch", { name: "Desktop notifications for new mail" });
  if (await notifications.count()) await expect(notifications).toHaveAttribute("aria-checked", /^(true|false)$/);
});

test("the display choices are radio groups: the arrow keys choose", async ({ page }) => {
  await signIn(page);
  await goTo(page, "#settings/general");
  const theme = page.getByRole("radiogroup", { name: "Theme" });
  const light = theme.getByRole("radio", { name: "Light" });
  await light.focus();
  await page.keyboard.press("ArrowRight");
  await expect(theme.getByRole("radio", { name: "Dark" })).toBeChecked();
  await page.keyboard.press("ArrowRight");
  await expect(theme.getByRole("radio", { name: "System" })).toBeChecked();
});
