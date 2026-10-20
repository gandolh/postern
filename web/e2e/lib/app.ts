// Driving Postern in the browser: sign in, open a conversation, and record
// everything a page does (requests, console, errors, popups, top-frame
// navigations, CSP violations) so a spec can assert on it afterwards.

import { expect, type BrowserContext, type ConsoleMessage, type Page, type Request } from "@playwright/test";
import { address, password, type AccountName } from "./devmail.ts";
import { APP_URL, isPosternUrl } from "./env.ts";

/** Message frames carry exactly this sandbox (corpus/wiki/security.md). Written out, not imported: the test is the spec. */
export const MESSAGE_FRAME_SANDBOX = "allow-popups allow-popups-to-escape-sandbox";

/** The canary every script payload in the hostile set tries to set. */
export const CANARY = "__POSTERN_PWNED";

/**
 * Collect CSP violations in every document of the page that can run script
 * (the app; never the message frames, which cannot). Frame violations show up
 * as console messages instead, which the recorder keeps too.
 */
export async function watchCspViolations(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    const w = window as unknown as { __cspViolations?: string[] };
    w.__cspViolations = [];
    document.addEventListener("securitypolicyviolation", (e) => {
      w.__cspViolations?.push(`${e.effectiveDirective} blocked ${e.blockedURI || "(inline)"} in ${e.documentURI}`);
    });
  });
}

export async function cspViolations(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as { __cspViolations?: string[] }).__cspViolations ?? []);
}

export interface Recording {
  requests: Request[];
  console: ConsoleMessage[];
  pageErrors: string[];
  /** Pages opened while recording (new tabs from links). */
  popups: Page[];
  /** Top-frame navigations, URLs in order. */
  topNavigations: string[];
  /** Requests that left Postern's two paths. */
  foreignRequests(): string[];
  /** Console text that looks like a CSP refusal. */
  cspConsole(): string[];
  stop(): void;
}

/** Start recording a page. Requests include every frame's; popups are other pages. */
export function record(page: Page): Recording {
  const requests: Request[] = [];
  const consoleMessages: ConsoleMessage[] = [];
  const pageErrors: string[] = [];
  const popups: Page[] = [];
  const topNavigations: string[] = [];
  const onRequest = (r: Request) => requests.push(r);
  const onConsole = (m: ConsoleMessage) => consoleMessages.push(m);
  const onError = (e: Error) => pageErrors.push(e.message);
  const onPage = (p: Page) => popups.push(p);
  const onNav = (frame: { parentFrame(): unknown; url(): string }) => {
    if (frame.parentFrame() === null) topNavigations.push(frame.url());
  };
  page.on("request", onRequest);
  page.on("console", onConsole);
  page.on("pageerror", onError);
  page.on("framenavigated", onNav);
  page.context().on("page", onPage);
  return {
    requests,
    console: consoleMessages,
    pageErrors,
    popups,
    topNavigations,
    foreignRequests: () => requests.map((r) => r.url()).filter((u) => !isPosternUrl(u)),
    cspConsole: () =>
      consoleMessages.map((m) => m.text()).filter((t) => /Content Security Policy|Refused to (load|apply|execute|frame|connect|create)/i.test(t)),
    stop: () => {
      page.off("request", onRequest);
      page.off("console", onConsole);
      page.off("pageerror", onError);
      page.off("framenavigated", onNav);
      page.context().off("page", onPage);
    },
  };
}

/**
 * Answer every request that leaves the origin, so nothing reaches the
 * network: a small page for navigations (new tabs from links), a 1x1 PNG for
 * images on track.evil.test (the remote-content fixture), 404 for the rest.
 * The requests still show up in the recording.
 */
export async function stubOutsideWorld(context: BrowserContext): Promise<void> {
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");
  await context.route(
    (url) => url.protocol !== "data:" && url.protocol !== "blob:" && !isPosternUrl(url.href),
    async (route) => {
      const request = route.request();
      if (request.isNavigationRequest()) {
        await route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>Outside Postern</title><p>A page outside Postern.</p>" });
      } else if (new URL(request.url()).hostname === "track.evil.test") {
        await route.fulfill({ status: 200, contentType: "image/png", body: png });
      } else {
        await route.fulfill({ status: 404, body: "" });
      }
    },
  );
}

/**
 * Sign in through the form. If the app does not come up, the password field
 * is emptied before the failure is reported: a failing locator assertion
 * writes the accessibility tree, input values included, to test-results.
 */
export async function signIn(page: Page, who: AccountName = "alice"): Promise<void> {
  await page.goto(APP_URL);
  await page.locator("input[name=username]").fill(address(who));
  const field = page.locator("input[name=password]");
  await field.fill(password(who));
  try {
    await page.locator("button[type=submit]").click();
    await expect(page.locator(".shell")).toBeVisible({ timeout: 20_000 });
  } catch (err) {
    await field.fill("", { timeout: 2_000 }).catch(() => undefined);
    throw err;
  }
}

/** Go to a route in the signed-in app (a hash change: a reload would sign out). */
export async function goTo(page: Page, hash: string): Promise<void> {
  await page.evaluate((h) => {
    window.location.hash = h;
  }, hash);
}

/** Open a conversation from a user label and wait for its subject. */
export async function openConversation(page: Page, labelId: string, threadId: string): Promise<void> {
  await goTo(page, `#label/${encodeURIComponent(labelId)}/${encodeURIComponent(threadId)}`);
  await expect(page.locator(".conv-page h1#conv-subject")).toBeVisible();
}

/** The value of the canary in the top document. */
export function canary(page: Page): Promise<unknown> {
  return page.evaluate((name) => (window as unknown as Record<string, unknown>)[name], CANARY);
}

/**
 * The app document's HTML with every iframe's srcdoc removed: what Postern
 * itself put in its DOM. Message HTML may only ever be inside a srcdoc.
 */
export function appHtmlWithoutSrcdoc(page: Page): Promise<string> {
  return page.evaluate(() => {
    const copy = document.documentElement.cloneNode(true) as HTMLElement;
    for (const frame of Array.from(copy.querySelectorAll("iframe"))) frame.removeAttribute("srcdoc");
    return copy.outerHTML;
  });
}
