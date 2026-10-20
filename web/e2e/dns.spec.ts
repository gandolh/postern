// Below the request log: Chrome's own network log (--log-net-log) records
// every host it resolves or connects to, including DNS prefetches and
// preconnects that never become a request Playwright sees. Opening every
// hostile message, pointing at every link and waiting must not make Chrome
// look up a single host the messages name. A lookup alone tells the sender's
// DNS server that the message was read.

import { chromium, expect, test } from "@playwright/test";
import { readFileSync, rmSync } from "node:fs";
import { openConversation, signIn } from "./lib/app.ts";
import { hostileSet } from "./lib/devmail.ts";

/** Every host the hostile set names (punycode forms included), and the stand-ins the seed uses. */
const MESSAGE_HOSTS = [
  "evil.test",
  "example.com",
  "example.org",
  "bank.example.com",
  "accounts.example.com",
  "xn--80ak6aa92e.test",
  "xn--pple-43d.test",
  "xn--ypal-43d9g.test",
  "xn--80a1acny.test",
];

test("no host named in a message is looked up before Display images", async () => {
  test.setTimeout(180_000);
  const netLog = test.info().outputPath("netlog.json");
  const browser = await chromium.launch({ channel: "chromium", args: [`--log-net-log=${netLog}`, "--net-log-capture-mode=Default"] });
  try {
    const context = await browser.newContext({ serviceWorkers: "block" });
    const page = await context.newPage();
    await signIn(page);
    const hostile = await hostileSet();
    for (const fixture of hostile.bySlug.values()) {
      await openConversation(page, hostile.labelId, fixture.threadId);
      const frame = page.locator(".conv-page iframe").first();
      if ((await frame.count()) > 0) {
        await frame.scrollIntoViewIfNeeded();
        const box = await frame.boundingBox();
        // Point at everything (hover, no click): Chrome may prefetch or preconnect a hovered link's host.
        if (box) for (let y = box.y + 4; y < Math.min(box.y + box.height, 700); y += 18) await page.mouse.move(box.x + 40, y);
      }
      await page.waitForTimeout(500);
    }
    await page.waitForTimeout(2_000);
    await context.close();
  } finally {
    await browser.close();
  }
  const log = readFileSync(netLog, "utf8");
  // Default capture strips credentials, but the log is 2-3 MB of this run's traffic: keep nothing.
  rmSync(netLog, { force: true });
  // The log exists and saw this run's traffic, so an empty result means something.
  expect(log.includes("localhost"), "the net log recorded this run").toBe(true);
  expect(MESSAGE_HOSTS.filter((host) => log.includes(host))).toEqual([]);
});
