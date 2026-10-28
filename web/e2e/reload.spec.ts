// Brief 27: a reload keeps the session, closing the tab ends it. The refresh
// token (and only it, with the account and the last activity) is kept in this
// tab's sessionStorage; a reload signs in again with one refresh grant. Tokens
// are only ever compared, never printed.

import { expect, test, type Page, type Request } from "@playwright/test";
import { goTo, keptSession, sawPasswordField, signIn, stubOutsideWorld, watchPasswordField } from "./lib/app.ts";
import { APP_URL, ORIGIN } from "./lib/env.ts";

const TOKEN_URL = `${ORIGIN}/webmail-api/auth/token`;
const PASSWORD_URL = `${ORIGIN}/webmail-api/api/auth`;
const KEY = "postern.session";

/** The token and password posts a page makes from now on. */
function recordAuthPosts(page: Page): { refreshGrants: () => Request[]; codeGrants: () => Request[]; passwordPosts: () => Request[] } {
  const posts: Request[] = [];
  page.on("request", (r) => {
    if (r.method() === "POST" && (r.url() === TOKEN_URL || r.url() === PASSWORD_URL)) posts.push(r);
  });
  const grant = (r: Request) => new URLSearchParams(r.postData() ?? "").get("grant_type");
  return {
    refreshGrants: () => posts.filter((r) => r.url() === TOKEN_URL && grant(r) === "refresh_token"),
    codeGrants: () => posts.filter((r) => r.url() === TOKEN_URL && grant(r) === "authorization_code"),
    passwordPosts: () => posts.filter((r) => r.url() === PASSWORD_URL),
  };
}

const postern = (page: Page) => page.evaluate(() => Object.keys(sessionStorage).filter((k) => k.startsWith("postern")));

test.beforeEach(async ({ context }) => {
  await stubOutsideWorld(context);
});

test("a reload shows the Inbox without the sign-in form: one refresh grant, no password post", async ({ page }) => {
  let accessTokens: string[] = [];
  page.on("response", async (response) => {
    if (response.url() !== TOKEN_URL) return;
    const json = (await response.json().catch(() => null)) as { access_token?: string } | null;
    if (json?.access_token) accessTokens = [...accessTokens, json.access_token];
  });
  await watchPasswordField(page);
  await signIn(page);
  await goTo(page, "#inbox");
  await expect(page.getByRole("grid", { name: "Conversations in Inbox" })).toBeVisible();
  expect(await postern(page)).toEqual([KEY]);

  const posts = recordAuthPosts(page);
  await page.reload();
  await expect(page.getByRole("grid", { name: "Conversations in Inbox" })).toBeVisible({ timeout: 20_000 });
  expect(await sawPasswordField(page), "the password field appeared during the reload").toBe(false);
  expect(posts.refreshGrants()).toHaveLength(1);
  expect(posts.codeGrants()).toHaveLength(0);
  expect(posts.passwordPosts()).toHaveLength(0);
  // What is kept is the refresh token and the account; no access token (compared, never printed).
  const raw = (await page.evaluate((key) => sessionStorage.getItem(key), KEY)) ?? "";
  expect(accessTokens.length).toBeGreaterThan(0);
  expect(
    accessTokens.some((t) => raw.includes(t)),
    "an access token in sessionStorage",
  ).toBe(false);
  expect((await keptSession(page))?.username).toBe("alice@postern.test");
});

test("closing the tab and opening Postern again shows the sign-in form", async ({ page, context }) => {
  await signIn(page);
  await page.close();
  const again = await context.newPage();
  await again.goto(APP_URL);
  await expect(again.locator("input[name=password]")).toBeVisible();
  expect(await postern(again)).toEqual([]);
});

test("sign out, then reload: the sign-in form, and sessionStorage holds nothing of the session", async ({ page }) => {
  await signIn(page);
  await page.getByRole("button", { name: /^Account:/ }).click();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.locator("input[name=username]")).toBeVisible();
  expect(await postern(page)).toEqual([]);
  await page.reload();
  await expect(page.locator("input[name=password]")).toBeVisible();
  expect(await postern(page)).toEqual([]);
});

test("a reload after the idle deadline passed signs out, says why, and keeps nothing", async ({ page }) => {
  await signIn(page);
  // As if the tab had sat 8 hours and a minute without input before the reload.
  await page.evaluate((key) => {
    const kept = JSON.parse(sessionStorage.getItem(key) ?? "{}") as { lastActivity: number };
    sessionStorage.setItem(key, JSON.stringify({ ...kept, lastActivity: Date.now() - (8 * 60 + 1) * 60_000 }));
  }, KEY);
  const posts = recordAuthPosts(page);
  await page.reload();
  await expect(page.locator(".auth-notice")).toHaveText("You were signed out after a long time without activity. Sign in again to continue.");
  expect(posts.refreshGrants()).toHaveLength(0);
  expect(await postern(page)).toEqual([]);
});

test("a refused refresh token on reload shows the sign-in form and clears sessionStorage", async ({ page }) => {
  await signIn(page);
  await page.evaluate((key) => {
    const kept = JSON.parse(sessionStorage.getItem(key) ?? "{}") as { refreshToken: string };
    sessionStorage.setItem(key, JSON.stringify({ ...kept, refreshToken: `${kept.refreshToken.slice(0, -4)}AAAA` }));
  }, KEY);
  const refused = page.waitForResponse((r) => r.url() === TOKEN_URL);
  await page.reload();
  expect((await refused).status()).toBe(400);
  await expect(page.locator("input[name=password]")).toBeVisible();
  expect(await postern(page)).toEqual([]);
});

test("two tabs with the same refresh token (a duplicated tab): each one's refresh leaves the other signed in", async ({ page, context }) => {
  await signIn(page);
  const kept = await page.evaluate((key) => sessionStorage.getItem(key), KEY);
  expect(kept).toBeTruthy();
  // Duplicating a tab copies its sessionStorage; Playwright cannot duplicate, so copy it in before the first load.
  const twin = await context.newPage();
  await twin.addInitScript(
    ([key, value]) => {
      if (!sessionStorage.getItem(key)) sessionStorage.setItem(key, value);
    },
    [KEY, kept ?? ""] as const,
  );
  const twinPosts = recordAuthPosts(twin);
  await twin.goto(APP_URL);
  await expect(twin.locator(".shell")).toBeVisible({ timeout: 20_000 });

  const posts = recordAuthPosts(page);
  await page.reload();
  await expect(page.locator(".shell")).toBeVisible({ timeout: 20_000 });
  await twin.reload();
  await expect(twin.locator(".shell")).toBeVisible({ timeout: 20_000 });
  await page.reload();
  await expect(page.locator(".shell")).toBeVisible({ timeout: 20_000 });
  expect(posts.refreshGrants()).toHaveLength(2);
  expect(twinPosts.refreshGrants()).toHaveLength(2);
  expect(posts.passwordPosts().length + twinPosts.passwordPosts().length).toBe(0);
});
