// The hostile seed set (dev/seed/hostile/, brief 02) opened in the real app,
// one test per fixture. Each one checks, in Chromium against the production
// build and its headers:
//
//   - no script runs: the canary stays unset in the app and in the frame, and
//     nothing in the frame was even left for the sandbox to block;
//   - nothing is fetched outside /webmail and /webmail-api until "Display
//     images", and after it only the message's own image hosts, with no
//     Referer;
//   - the app never navigates: same URL, no top-frame navigation, and a link
//     clicked in the frame opens a new tab with no opener and no referrer;
//   - each message frame has exactly the allowed sandbox, there are as many
//     frames as HTML bodies, and no message markup is in the app's own DOM.
//
// Plus the sender and link warnings that live outside the frame.

import { expect, test, type Frame, type Page } from "@playwright/test";
import {
  appHtmlWithoutSrcdoc,
  canary,
  CANARY,
  MESSAGE_FRAME_SANDBOX,
  openConversation,
  record,
  signIn,
  stubOutsideWorld,
  type Recording,
} from "./lib/app.ts";
import { hostileSet, manifest, type HostileFixture } from "./lib/devmail.ts";
import { ORIGIN } from "./lib/env.ts";

interface Expectation {
  /** Message frames: one per HTML body; a plain-text body is React text. */
  frames: 0 | 1;
  /** Markup from the message that must never appear in the app's own DOM. */
  markers?: string[];
  /** The "Images are not displayed" bar shows; after "Display images" only these hosts are fetched. */
  remoteHosts?: string[];
  /** The "Check links before you click" banner shows, outside the frame. */
  linkWarning?: boolean;
  /** How long to watch after opening (meta-refresh waits out its 2-second refresh). */
  settleMs?: number;
  /** CSP refusals that are the policy doing its job, not a leak (see base-href). */
  expectedCsp?: RegExp[];
}

const EXPECTED: Record<string, Expectation> = {
  "base-href": {
    frames: 1,
    markers: ["<base", 'href="account/settings"', 'action="collect"'],
    // The sanitiser parses the message in an inert DOMParser document, which
    // inherits the app's CSP: the message's <base> is refused there before
    // DOMPurify removes it. Logged, harmless, and the policy working.
    expectedCsp: [/^Setting the document's base URI to '(https:\/\/evil\.test\/)?' violates the following Content Security Policy directive: "base-uri 'none'"/],
  },
  "css-overlay": { frames: 1, markers: ["phish-overlay", "phish-abs"] },
  "data-html-link": { frames: 1, markers: ['href="data:text/html', 'href="DATA:text/html', "data:image/svg+xml;base64,PHN2Zy"] },
  "double-extension": { frames: 0, markers: ["Not actually a PDF"] },
  "event-handlers": { frames: 1, markers: ["onerror=", "ontoggle=", "onmouseover=", "onfocus="], remoteHosts: ["evil.test"] },
  "forged-sender-address-name": { frames: 0 },
  "forged-sender": { frames: 1 },
  "form-post": { frames: 1, markers: ["evil.test/collect", "evil.test/get-collect", "evil.test/detached"] },
  "iframe-object-embed": { frames: 1, markers: ["evil.test/frame", "object.pdf", "embed.swf", "iframe-srcdoc"] },
  "javascript-link": { frames: 1, markers: ["javascript:window", "JaVaScRiPt:"], remoteHosts: ["evil.test"] },
  "link-text-mismatch": { frames: 1, markers: ['href="https://evil.test/login"'], linkWarning: true },
  "meta-refresh": { frames: 1, markers: ['http-equiv="refresh"', "evil.test/phish"], settleMs: 3_000 },
  "punycode-domain": { frames: 1, markers: ['href="https://xn--pple-43d.test/"'], linkWarning: true },
  "remote-content": { frames: 1, markers: ["track.evil.test/pixel.gif", "leak.woff2"], remoteHosts: ["track.evil.test"] },
  "script-tag": { frames: 1, markers: ["evil.test/payload.js", "script-tag-upper"] },
  "svg-attachment": { frames: 1, markers: ["svg-attachment-inline", "onload="] },
  "svg-inline-script": { frames: 1, markers: ["svg-inline-onload", "svg-inline-xlink", "evil.test/foreign"] },
};

/** Paths the remote-content fixture names that must stay unfetched even after "Display images": fonts, imports, video. */
const NEVER_FETCHED = ["leak.woff2", "imported.css", "clip.mp4"];

/** Playwright's own service-worker blocker reads navigator.serviceWorker in every frame; in the sandbox that throws. Not the message's doing. */
const TOOLING_ERRORS = [/Failed to read the 'serviceWorker' property from 'Navigator'/];

interface FrameReport {
  sandbox: string | null;
  referrerPolicy: string | null;
  scripts: number;
  handlers: string[];
  forbidden: string[];
  metas: string[];
  links: { href: string; rel: string | null; target: string | null }[];
  summaries: number;
  remoteUrls: string[];
  cssRemote: string[];
  cssImports: boolean;
}

/** Parse each message frame's srcdoc (an inert DOMParser document) and say what is in it. */
function frameReports(page: Page): Promise<FrameReport[]> {
  return page.evaluate(() => {
    const FORBIDDEN = "script,iframe,frame,object,embed,applet,form,input,button,select,textarea,base,link,svg,math,template,portal,audio,video,noscript";
    const IMAGE_ATTRS = ["src", "srcset", "background", "poster", "data", "action", "formaction", "xlink:href"];
    return Array.from(document.querySelectorAll<HTMLIFrameElement>(".conv-page iframe"), (frame) => {
      const doc = new DOMParser().parseFromString(frame.getAttribute("srcdoc") ?? "", "text/html");
      const all = Array.from(doc.querySelectorAll("*"));
      const css = [...Array.from(doc.querySelectorAll("style"), (s) => s.textContent ?? ""), ...all.map((el) => el.getAttribute("style") ?? "")].join("\n");
      return {
        sandbox: frame.getAttribute("sandbox"),
        referrerPolicy: frame.getAttribute("referrerpolicy"),
        scripts: doc.querySelectorAll("script").length,
        handlers: all.flatMap((el) => Array.from(el.attributes).filter((a) => /^on/i.test(a.name)).map((a) => `${el.localName}[${a.name}]`)),
        forbidden: Array.from(doc.querySelectorAll(FORBIDDEN), (el) => el.localName),
        metas: Array.from(doc.querySelectorAll("meta"), (m) => (m.getAttribute("http-equiv") ?? m.getAttribute("name") ?? "charset").toLowerCase()),
        links: Array.from(doc.querySelectorAll("a[href], area[href]"), (a) => ({ href: a.getAttribute("href") ?? "", rel: a.getAttribute("rel"), target: a.getAttribute("target") })),
        summaries: doc.querySelectorAll("details > summary").length,
        remoteUrls: all.flatMap((el) => IMAGE_ATTRS.map((name) => el.getAttribute(name) ?? "").filter((v) => /(^|[\s,])(https?:)?\/\//i.test(v))),
        cssRemote: css.match(/url\(\s*["']?\s*(https?:)?\/\/[^)]*\)/gi) ?? [],
        cssImports: /@import|@font-face/i.test(css),
      };
    });
  });
}

/**
 * Try to get a reaction out of the message the way a reader would: move a
 * real pointer across the whole frame, then Tab to each link (or <summary>)
 * in it and press Enter. Only real input, and no locator inside the frame:
 * Playwright's own helpers there try to run script once the frame is clicked,
 * which the sandbox blocks and logs exactly as it would the message's.
 */
async function poke(page: Page, focusable: number): Promise<void> {
  const element = page.locator(".conv-page iframe").first();
  await element.scrollIntoViewIfNeeded();
  const box = await element.boundingBox();
  if (!box) return;
  const viewport = page.viewportSize() ?? { width: 1280, height: 720 };
  const bottom = Math.min(box.y + box.height, viewport.height) - 2;
  for (let y = Math.max(box.y, 0) + 2; y < bottom; y += 24) {
    for (let x = box.x + 2; x < box.x + box.width - 2; x += 60) await page.mouse.move(x, y);
  }
  for (let i = 1; i <= focusable; i++) {
    // A click at the frame's corner puts the focus start at the top of the message.
    await page.mouse.click(box.x + 2, Math.max(box.y, 0) + 2);
    for (let t = 0; t < i; t++) await page.keyboard.press("Tab");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(150);
  }
}

function scriptErrors(rec: Recording): string[] {
  return rec.pageErrors.filter((e) => !TOOLING_ERRORS.some((t) => t.test(e)));
}

/** Console lines from frames that would mean script ran, or was there to block. */
function scriptConsole(rec: Recording): string[] {
  return rec.console.map((m) => m.text()).filter((t) => t.includes(CANARY) || /Blocked script execution|Refused to execute/i.test(t));
}

async function messageFrame(page: Page): Promise<Frame | null> {
  const handle = await page.locator(".conv-page iframe").first().elementHandle({ timeout: 2_000 }).catch(() => null);
  return handle ? handle.contentFrame() : null;
}

let fixtures: Map<string, HostileFixture>;
let labelId: string;

test.beforeAll(async () => {
  const set = await hostileSet();
  fixtures = set.bySlug;
  labelId = set.labelId;
});

test("every hostile fixture in the seed has a test here", () => {
  expect(manifest().hostile.fixtures.map((f) => f.slug).sort()).toEqual(Object.keys(EXPECTED).sort());
});

test("control: the canary check does catch a script that runs", async ({ page }) => {
  // The same payload as script-tag, in a frame WITHOUT the sandbox: it runs and reaches the top.
  await page.setContent(`<iframe srcdoc="<script>top.${CANARY} = 'control'</script>"></iframe>`);
  await expect.poll(() => canary(page)).toBe("control");
});

for (const [slug, expectation] of Object.entries(EXPECTED)) {
  test(`hostile/${slug}`, async ({ page, context }) => {
    await stubOutsideWorld(context);
    const rec = record(page);
    await signIn(page);
    const fixture = fixtures.get(slug)!;
    await openConversation(page, labelId, fixture.threadId);
    const openedUrl = page.url();
    const navigationsAtOpen = rec.topNavigations.length;

    const frames = page.locator(".conv-page iframe");
    await expect(frames).toHaveCount(expectation.frames);
    if (expectation.frames === 0) await expect(page.locator(".conv-page article")).toContainText(slug === "double-extension" ? "double-extension" : "forged-sender-address-name");

    const opened = await frameReports(page);
    // Links with a target, and <details> toggles: what Tab can reach in the frame.
    const focusable = opened.reduce((n, r) => n + r.links.filter((l) => !l.href.startsWith("#")).length + r.summaries, 0);
    if (expectation.frames > 0) await poke(page, focusable);
    await page.waitForTimeout(expectation.settleMs ?? 750);

    await test.step("no script runs", async () => {
      // Read the console first: evaluating in the frame below is Playwright's script, not the message's.
      expect(scriptConsole(rec)).toEqual([]);
      expect(scriptErrors(rec)).toEqual([]);
      expect(await canary(page), "the canary in the app").toBeUndefined();
      const frame = expectation.frames > 0 ? await messageFrame(page) : null;
      if (expectation.frames > 0) expect(frame, "the message frame").not.toBeNull();
      if (frame) expect(await frame.evaluate((name) => (window as unknown as Record<string, unknown>)[name], CANARY), "the canary in the frame").toBeUndefined();
    });

    await test.step("the frame: exact sandbox, no script, links open apart", async () => {
      const reports = await frameReports(page);
      expect(reports).toHaveLength(expectation.frames);
      for (const report of reports) {
        expect(report.sandbox).toBe(MESSAGE_FRAME_SANDBOX);
        expect(report.referrerPolicy).toBe("no-referrer");
        expect(report.scripts).toBe(0);
        expect(report.handlers).toEqual([]);
        expect(report.forbidden).toEqual([]);
        expect(report.metas).toEqual(["charset", "content-security-policy", "referrer", "x-dns-prefetch-control", "color-scheme"]);
        expect(report.remoteUrls, "remote URLs before Display images").toEqual([]);
        expect(report.cssRemote, "remote CSS url() before Display images").toEqual([]);
        expect(report.cssImports).toBe(false);
        for (const link of report.links) {
          expect(link.href).toMatch(/^(https?:|mailto:|#)/);
          if (link.href.startsWith("#")) continue;
          expect(link.rel, link.href).toBe("noopener noreferrer");
          expect(link.target, link.href).toBe("_blank");
        }
      }
    });

    await test.step("no message markup in the app's DOM", async () => {
      const html = await appHtmlWithoutSrcdoc(page);
      const markers = [CANARY, ...(expectation.frames > 0 ? [`fixture <b>${slug}</b>`] : []), ...(expectation.markers ?? [])];
      expect(markers.filter((m) => html.includes(m))).toEqual([]);
      await expect(page.locator(".conv-page iframe:not([srcdoc])")).toHaveCount(0);
    });

    await test.step("the app never navigates; links open a new tab with no opener", async () => {
      expect(page.url()).toBe(openedUrl);
      expect(rec.topNavigations.slice(navigationsAtOpen)).toEqual([]);
      const tabs = rec.popups.filter((p) => p !== page);
      // Enter on each web link opened exactly one tab: the opener checks below really ran.
      const webLinks = opened.reduce((n, r) => n + r.links.filter((l) => /^https?:/.test(l.href)).length, 0);
      expect(tabs).toHaveLength(webLinks);
      for (const tab of tabs) {
        await tab.waitForLoadState();
        expect(tab.url()).toMatch(/^https?:\/\//);
        expect(tab.url().startsWith(ORIGIN)).toBe(false);
        expect(await tab.evaluate(() => window.opener)).toBeNull();
        expect(await tab.evaluate(() => document.referrer)).toBe("");
        await tab.close();
      }
    });

    await test.step("nothing fetched outside /webmail before Display images", async () => {
      expect(rec.foreignRequests()).toEqual([]);
      expect(rec.cspConsole().filter((line) => !(expectation.expectedCsp ?? []).some((re) => re.test(line)))).toEqual([]);
    });

    const bar = page.locator(".conv-page .conv-banner", { hasText: "Images are not displayed." });
    if (!expectation.remoteHosts) {
      await expect(bar).toHaveCount(0);
    } else {
      await test.step("after Display images: only the message's image hosts, no Referer, still no script", async () => {
        await expect(bar).toBeVisible();
        const before = rec.requests.length;
        await bar.getByRole("button", { name: "Display images below" }).click();
        await expect(bar).toHaveCount(0);
        await page.waitForTimeout(1_500);
        const after = rec.requests.slice(before).filter((r) => !r.url().startsWith(`${ORIGIN}/webmail`) && !r.url().startsWith("data:"));
        expect(after.length, "remote images were requested").toBeGreaterThan(0);
        for (const request of after) {
          const url = new URL(request.url());
          expect(expectation.remoteHosts, request.url()).toContain(url.hostname);
          expect(url.protocol).toBe("https:");
          expect(NEVER_FETCHED.some((path) => url.pathname.endsWith(path)), request.url()).toBe(false);
          expect(await request.headerValue("referer"), request.url()).toBeNull();
        }
        expect(await canary(page)).toBeUndefined();
        expect(scriptConsole(rec)).toEqual([]);
        for (const report of await frameReports(page)) {
          expect(report.sandbox).toBe(MESSAGE_FRAME_SANDBOX);
          expect(report.cssImports).toBe(false);
        }
        expect(page.url()).toBe(openedUrl);
      });
    }

    const linkBanner = page.locator(".conv-page .conv-banner-warning", { hasText: "Check links before you click" });
    await expect(linkBanner).toHaveCount(expectation.linkWarning ? 1 : 0);
    rec.stop();
  });
}

test("a forged display name shows the real address and the warning", async ({ page, context }) => {
  await stubOutsideWorld(context);
  await signIn(page);
  await openConversation(page, labelId, fixtures.get("forged-sender-address-name")!.threadId);
  const card = page.locator(".conv-page article").first();
  await expect(card.locator(".conv-sender-address")).toContainText("attacker@evil.test");
  await expect(card.locator(".conv-forged")).toHaveText("The name says security@bank.example.com, but this message came from attacker@evil.test.");

  await openConversation(page, labelId, fixtures.get("forged-sender")!.threadId);
  const forged = page.locator(".conv-page article").first();
  await expect(forged.locator(".conv-sender-name")).toHaveText("Account Support");
  await expect(forged.locator(".conv-sender-address")).toContainText("attacker@evil.test");
});

test("mismatched and look-alike links are named outside the frame", async ({ page, context }) => {
  await stubOutsideWorld(context);
  await signIn(page);
  await openConversation(page, labelId, fixtures.get("link-text-mismatch")!.threadId);
  const banner = page.locator(".conv-page .conv-banner-warning");
  await expect(banner.locator(".conv-banner-title")).toHaveText("Check links before you click");
  await expect(banner.locator("li").first()).toHaveText("“https://accounts.example.com/login” goes to evil.test");
  await expect(banner.locator("li").last()).toHaveText("and 1 more");

  await openConversation(page, labelId, fixtures.get("punycode-domain")!.threadId);
  const items = page.locator(".conv-page .conv-banner-warning li");
  await expect(items).toHaveText([
    "“apple.test look-alike (punycode xn--80ak6aa92e)” goes to xn--80ak6aa92e.test",
    "A link goes to xn--pple-43d.test, a name written to look like another",
    "A link goes to xn--ypal-43d9g.test, a name written to look like another",
  ]);
  // почта.test is an ordinary Cyrillic name: not flagged (brief 17).
  await expect(page.locator(".conv-page .conv-banner-warning")).not.toContainText("xn--80a1acny");
});

test("an attachment named to deceive downloads under its real name and never opens", async ({ page, context }) => {
  await stubOutsideWorld(context);
  const rec = record(page);
  await signIn(page);
  await openConversation(page, labelId, fixtures.get("double-extension")!.threadId);
  const chip = page.locator(".att-chip", { hasText: "invoice.pdf.html" });
  await expect(chip.locator(".att-warning")).toHaveText("Named like a .pdf file, but it is a .html file. Download only.");
  const downloading = page.waitForEvent("download");
  await chip.locator(".att-main").click();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe("invoice.pdf.html");
  await download.cancel();
  await page.waitForTimeout(500);
  expect(rec.popups.filter((p) => p !== page)).toEqual([]);
  expect(await canary(page)).toBeUndefined();

  await openConversation(page, labelId, fixtures.get("svg-attachment")!.threadId);
  const svgChips = page.locator(".att-chip", { hasText: ".svg" });
  await expect(svgChips).toHaveCount(2);
  for (const chipEl of await svgChips.all()) await expect(chipEl.getByRole("button", { name: /^Preview/ })).toHaveCount(0);
  const srcdoc = (await page.locator(".conv-page iframe").getAttribute("srcdoc")) ?? "";
  expect(srcdoc.includes("data:image/svg")).toBe(false);
  expect(rec.foreignRequests()).toEqual([]);
  rec.stop();
});
