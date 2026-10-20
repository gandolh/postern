// The production headers (Caddyfile, lib/headers.ts) and every screen working
// under them: the production build served by Caddy, the service worker on,
// and no CSP violation anywhere (the page's securitypolicyviolation events and
// every console line from every page, frames included).

import { expect, test, type ConsoleMessage, type Page } from "@playwright/test";
import { cspViolations, goTo, openConversation, signIn, stubOutsideWorld, watchCspViolations } from "./lib/app.ts";
import { hostileSet, labelId, threadBySubject } from "./lib/devmail.ts";
import { API_HEADERS, APP_HEADERS } from "./lib/headers.ts";
import { APP_URL, ORIGIN } from "./lib/env.ts";

test.use({ serviceWorkers: "allow" });

const CSP_CONSOLE = /Content Security Policy|Refused to (load|apply|execute|frame|connect|create|send)|Permissions-Policy|Unrecognized feature/i;

/** Collect CSP-looking console lines from every page the context opens (the PDF tab too). */
function watchConsole(page: Page): string[] {
  const lines: string[] = [];
  const onMessage = (m: ConsoleMessage) => {
    if (CSP_CONSOLE.test(m.text())) lines.push(`${m.location().url || "?"}: ${m.text()}`);
  };
  page.on("console", onMessage);
  page.context().on("page", (p) => p.on("console", onMessage));
  return lines;
}

/** Soft, so one run reports every screen that breaks the policy, not just the first. */
async function noViolations(page: Page, consoleLines: string[], where: string): Promise<void> {
  expect.soft(await cspViolations(page), `securitypolicyviolation events after ${where}`).toEqual([]);
  expect.soft(consoleLines, `CSP console lines after ${where}`).toEqual([]);
}

test.describe("headers", () => {
  test("the app's responses carry the production header set", async ({ request }) => {
    const asset = (await (await request.get(APP_URL)).text()).match(/\/webmail\/assets\/[^"]+\.js/)?.[0];
    expect(asset).toBeTruthy();
    for (const path of ["/webmail/", "/webmail/index.html", "/webmail/sw.js", "/webmail/manifest.webmanifest", asset!, "/webmail/#inbox", "/webmail/no-such-page"]) {
      const res = await request.get(`${ORIGIN}${path}`);
      expect(res.status(), path).toBe(200);
      const headers = res.headers();
      for (const [name, value] of Object.entries(APP_HEADERS)) expect(headers[name], `${path} ${name}`).toBe(value);
      expect(headers["service-worker-allowed"], path).toBeUndefined();
      expect(headers["server"], path).toBeUndefined();
    }
    expect((await request.get(`${ORIGIN}/webmail/sw.js`)).headers()["cache-control"]).toBe("no-cache");
    expect((await request.get(`${ORIGIN}/webmail/manifest.webmanifest`)).headers()["content-type"]).toBe("application/manifest+json");
    expect((await request.get(`${ORIGIN}${asset}`)).headers()["cache-control"]).toBe("public, max-age=31536000, immutable");
  });

  test("/webmail-api passes only Postern's paths, with its own headers", async ({ request }) => {
    const session = await request.get(`${ORIGIN}/webmail-api/jmap/session`);
    expect(session.status()).toBe(200);
    for (const [name, value] of Object.entries(API_HEADERS)) expect(session.headers()[name], name).toBe(value);
    // Stalwart's admin UI, account pages, OAuth login page, management API and discovery stay off the shared origin.
    for (const path of ["/webmail-api/admin/", "/webmail-api/account/", "/webmail-api/login", "/webmail-api/api/principal", "/webmail-api/.well-known/openid-configuration", "/webmail-api/healthz/live"]) {
      expect((await request.get(`${ORIGIN}${path}`)).status(), path).toBe(404);
    }
  });
});

test("control: the watch does catch a violation", async ({ page, context }) => {
  await watchCspViolations(context);
  const lines = watchConsole(page);
  await page.goto(APP_URL);
  await page.evaluate(() => {
    const script = document.createElement("script");
    script.textContent = "window.inlineRan = true";
    document.head.append(script);
  });
  await expect.poll(() => cspViolations(page)).toContainEqual(expect.stringContaining("script-src-elem blocked inline"));
  expect(lines.length).toBeGreaterThan(0);
  expect(await page.evaluate(() => (window as unknown as { inlineRan?: boolean }).inlineRan)).toBeUndefined();
});

test("every screen works under the CSP", async ({ page, context }) => {
  test.setTimeout(180_000);
  await watchCspViolations(context);
  await stubOutsideWorld(context);
  const consoleLines = watchConsole(page);
  await signIn(page);

  await test.step("the service worker registers under /webmail/", async () => {
    const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
    expect(scope).toBe(APP_URL);
  });

  const work = await labelId("Work");
  await test.step("every list route", async () => {
    for (const hash of ["#inbox", "#starred", "#sent", "#drafts", "#spam", "#trash", "#all", `#label/${work}`, "#search/from%3Abob", "#contacts"]) {
      await goTo(page, hash);
      await expect(page.locator(".shell-main")).not.toBeEmpty();
      await page.waitForTimeout(400);
    }
    await noViolations(page, consoleLines, "the list routes");
  });

  await test.step("settings, the push opt-in among them", async () => {
    for (const section of ["general", "accounts", "labels", "filters"]) {
      await goTo(page, `#settings/${section}`);
      await expect(page.locator("#settings-title")).toBeVisible();
      await page.waitForTimeout(300);
    }
    await goTo(page, "#settings/general");
    await expect(page.getByText("Notifications for new mail when Postern is closed")).toBeVisible();
    await noViolations(page, consoleLines, "settings");
  });

  await test.step("the HTML signature preview, in its sandboxed frame", async () => {
    await goTo(page, "#settings/accounts");
    const field = page.getByLabel("Signature (HTML, optional)").first();
    await field.fill('<p style="color:#1c6a57"><b>Alice</b> <img src="https://track.evil.test/sig.png" alt="logo"></p>');
    await field.blur();
    const preview = page.locator("iframe.settings-preview").first();
    await expect(preview).toHaveAttribute("sandbox", "");
    await page.waitForTimeout(500);
    await field.fill("");
    await field.blur();
    await expect(preview).toHaveCount(0);
    await noViolations(page, consoleLines, "the signature preview");
  });

  await test.step("a conversation with inline cid: images, and an image preview", async () => {
    const offsite = await threadBySubject("Photos from the offsite");
    await goTo(page, `#inbox/${offsite.threadId}`);
    await expect(page.locator(".conv-page h1#conv-subject")).toHaveText("Photos from the offsite");
    await expect.poll(async () => ((await page.locator(".conv-page iframe").first().getAttribute("srcdoc")) ?? "").includes('src="data:image/png;base64,')).toBe(true);
    await page.getByRole("button", { name: "Preview group-photo.png" }).first().click();
    const viewer = page.locator("dialog[open] iframe.att-viewer-frame");
    await expect(viewer).toHaveAttribute("sandbox", "");
    await page.waitForTimeout(500);
    await page.keyboard.press("Escape");
    await noViolations(page, consoleLines, "inline images and the image preview");
  });

  await test.step("the PDF preview opens in its own tab", async () => {
    const contract = await threadBySubject("Contract draft v3 for Northwind");
    await goTo(page, `#inbox/${contract.threadId}`);
    await expect(page.locator(".conv-page h1#conv-subject")).toHaveText("Contract draft v3 for Northwind");
    const opening = context.waitForEvent("page");
    await page.getByRole("button", { name: "Preview northwind-agreement-v3.pdf" }).first().click();
    const tab = await opening;
    await expect.poll(() => tab.url(), { timeout: 15_000 }).toMatch(/^blob:http:\/\/localhost:\d+\//);
    expect(await tab.evaluate(() => window.opener)).toBeNull();
    expect(await tab.evaluate(() => document.contentType)).toBe("application/pdf");
    await tab.close();
    await noViolations(page, consoleLines, "the PDF preview");
  });

  await test.step("Display images on a remote-image message", async () => {
    const hostile = await hostileSet();
    await openConversation(page, hostile.labelId, hostile.bySlug.get("remote-content")!.threadId);
    await page.getByRole("button", { name: "Display images below" }).click();
    await page.waitForTimeout(1_500);
    await noViolations(page, consoleLines, "Display images");
  });

  await test.step("the composer: paste with formatting and an inline image", async () => {
    await goTo(page, "#inbox");
    await page.locator(".shell-nav-frame").getByText("Compose", { exact: true }).click();
    const editor = page.locator(".compose-editor-body").last();
    await expect(editor).toBeVisible();
    await editor.click();
    await editor.evaluate((el) => {
      const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
      const data = new DataTransfer();
      data.setData("text/html", `<p>Pasted <b>bold</b> and <a href="https://example.com/">a link</a></p><p><img src="data:image/png;base64,${png}" alt="dot" width="20" height="20"></p>`);
      data.setData("text/plain", "Pasted bold and a link");
      el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
    });
    await expect(editor.locator("b")).toHaveText("bold");
    await expect(editor.locator("img")).toHaveAttribute("src", /^blob:http:\/\/localhost:\d+\//, { timeout: 15_000 });
    await page.waitForTimeout(500);
    await noViolations(page, consoleLines, "the composer paste");
    await page.getByRole("button", { name: "Discard draft" }).last().click();
    await page.getByRole("button", { name: "Discard", exact: true }).click();
    await expect(page.locator(".compose-editor-body")).toHaveCount(0);
  });

  await test.step("the phone layout", async () => {
    await page.setViewportSize({ width: 390, height: 800 });
    const offsite = await threadBySubject("Photos from the offsite");
    for (const hash of ["#inbox", `#inbox/${offsite.threadId}`, "#settings/general", "#contacts"]) {
      await goTo(page, hash);
      await page.waitForTimeout(500);
    }
    await expect(page.locator(".shell-main")).toBeVisible();
    await noViolations(page, consoleLines, "the phone layout");
  });

  await noViolations(page, consoleLines, "the whole walk");
});
