// Brief 26: with conversation view off, a message row opens that message
// alone and marks only it read; Reply, Archive and j / k act on it; the copy
// counts messages. Against alice's "Q4 roadmap review", whose three newest
// Inbox messages are made unread for the run and put back as they were after.

import { expect, test, type Page } from "@playwright/test";
import { goTo, signIn, stubOutsideWorld } from "./lib/app.ts";
import { address, devJmap, password } from "./lib/devmail.ts";

const PREFS_KEY = `postern.prefs.${address("alice")}`;
const SUBJECT = "Q4 roadmap review";

interface Original {
  id: string;
  mailboxIds: Record<string, boolean>;
  seen: boolean;
}

let inbox = "";
let threadId = "";
/** The conversation's three newest Inbox messages, newest first: [o, n, m]. n is the middle row. */
let three: Original[] = [];
/** The seed has a reply draft in it, which opens inline wherever the conversation is read. */
let hasDraft = false;

async function jmapState(ids: readonly string[]): Promise<Map<string, { inInbox: boolean; seen: boolean }>> {
  const jmap = await devJmap("alice");
  const got = await jmap.one<{ list: { id: string; mailboxIds: Record<string, boolean>; keywords: Record<string, boolean> }[] }>("Email/get", {
    ids,
    properties: ["mailboxIds", "keywords"],
  });
  return new Map(got.list.map((e) => [e.id, { inInbox: e.mailboxIds[inbox] === true, seen: e.keywords["$seen"] === true }]));
}

test.describe.configure({ mode: "serial" });
// Tall enough that the middle message's row is drawn without scrolling.
test.use({ viewport: { width: 1280, height: 1200 } });

test.beforeAll(async () => {
  const jmap = await devJmap("alice");
  const boxes = await jmap.one<{ list: { id: string; role: string | null }[] }>("Mailbox/get", { ids: null, properties: ["role"] });
  inbox = boxes.list.find((b) => b.role === "inbox")!.id;
  const query = await jmap.one<{ ids: string[] }>("Email/query", { filter: { subject: SUBJECT }, limit: 50 });
  const got = await jmap.one<{ list: { id: string; threadId: string; subject: string; mailboxIds: Record<string, boolean>; keywords: Record<string, boolean>; receivedAt: string }[] }>(
    "Email/get",
    { ids: query.ids, properties: ["threadId", "subject", "mailboxIds", "keywords", "receivedAt"] },
  );
  threadId = got.list.find((e) => e.subject === SUBJECT)!.threadId;
  hasDraft = got.list.some((e) => e.threadId === threadId && e.keywords["$draft"] === true);
  three = got.list
    .filter((e) => e.threadId === threadId && e.mailboxIds[inbox] === true)
    .sort((a, b) => (a.receivedAt < b.receivedAt ? 1 : -1))
    .slice(0, 3)
    .map((e) => ({ id: e.id, mailboxIds: { ...e.mailboxIds }, seen: e.keywords["$seen"] === true }));
  expect(three).toHaveLength(3);
  const update: Record<string, Record<string, null>> = {};
  for (const m of three) update[m.id] = { "keywords/$seen": null };
  await jmap.one("Email/set", { update });
});

test.afterAll(async () => {
  if (three.length === 0) return;
  const jmap = await devJmap("alice");
  const update: Record<string, Record<string, unknown>> = {};
  for (const m of three) update[m.id] = { mailboxIds: m.mailboxIds, "keywords/$seen": m.seen ? true : null };
  await jmap.one("Email/set", { update });
});

/** Sign in with conversation view off on this device. */
async function start(page: Page): Promise<void> {
  await stubOutsideWorld(page.context());
  await page.addInitScript(([key, value]) => window.localStorage.setItem(key, value), [PREFS_KEY, JSON.stringify({ version: 1, conversationView: false })] as const);
  await signIn(page);
  await expect(page.getByRole("grid", { name: "Messages in Inbox" })).toBeVisible();
}

/** After a reload: sign in again in place if the form asks (the hash, and so the route, stays). */
async function signInAgainIfAsked(page: Page): Promise<void> {
  const form = page.locator("input[name=password]");
  const shell = page.locator(".shell");
  await expect(form.or(shell)).toBeVisible({ timeout: 20_000 });
  if (!(await form.isVisible())) return;
  await page.locator("input[name=username]").fill(address("alice"));
  await form.fill(password("alice"));
  try {
    await page.locator("button[type=submit]").click();
    await expect(shell).toBeVisible({ timeout: 20_000 });
  } catch (err) {
    await form.fill("", { timeout: 2_000 }).catch(() => undefined);
    throw err;
  }
}

const row = (page: Page, id: string) => page.locator(`[role=row][data-row-id="${id}"]`);
const cards = (page: Page) => page.locator(".conv-page [id^='conv-message-']");

test("a message row opens alone, marks only itself read, and survives a reload; Back returns to the list", async ({ page }) => {
  const [o, n, m] = three as [Original, Original, Original];
  await start(page);
  // Three unread rows of one conversation (m is further down the list, past the rows drawn).
  await expect(row(page, o.id)).toHaveAttribute("data-unread");
  await expect(row(page, n.id)).toHaveAttribute("data-unread");

  await row(page, n.id).click();
  await expect(page).toHaveURL(new RegExp(`#inbox/${threadId}/${n.id}$`));
  await expect(page.locator(".conv-page h1#conv-subject")).toHaveText(SUBJECT);
  await expect(cards(page)).toHaveCount(1);
  await expect(page.locator(`#conv-message-${n.id}`)).toHaveAttribute("data-expanded", "true");
  await expect.poll(async () => (await jmapState([n.id])).get(n.id)?.seen).toBe(true);
  const after = await jmapState([o.id, m.id]);
  expect(after.get(o.id)?.seen).toBe(false);
  expect(after.get(m.id)?.seen).toBe(false);

  await page.reload();
  await signInAgainIfAsked(page);
  await expect(page).toHaveURL(new RegExp(`#inbox/${threadId}/${n.id}$`));
  await expect(cards(page)).toHaveCount(1);
  await expect(page.locator(`#conv-message-${n.id}`)).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(/#inbox$/);
  await expect(row(page, n.id)).not.toHaveAttribute("data-unread");
  await expect(row(page, o.id)).toHaveAttribute("data-unread");
});

test("Reply quotes the open message, j / k open the next and previous rows, Archive moves only it", async ({ page }) => {
  const [o, n] = three as [Original, Original, Original];
  await start(page);
  const order = await page.locator("[role=row][data-row-id]").evaluateAll((rows) => rows.map((r) => r.getAttribute("data-row-id")));
  const below = order[order.indexOf(n.id) + 1];
  expect(below).toBeTruthy();

  await row(page, n.id).click();
  await expect(page.locator(`#conv-message-${n.id}`)).toBeVisible();

  // Reply on the open message (Dave's) quotes it, not the conversation's newest (Carol's).
  // The seed's reply draft in this conversation opens inline first: the new composer is the other one.
  const keys = () => page.locator("[data-compose-key]").evaluateAll((els) => els.map((e) => e.getAttribute("data-compose-key") ?? ""));
  if (hasDraft) await expect(page.locator(".conv-inline-reply [data-compose-key]")).toBeVisible();
  const before = await keys();
  await page.locator(`#conv-message-${n.id}`).getByRole("button", { name: "Reply", exact: true }).first().click();
  await expect.poll(async () => (await keys()).length).toBe(before.length + 1);
  const key = (await keys()).find((k) => !before.includes(k));
  const composer = page.locator(`[data-compose-key="${key}"]`);
  await expect(composer).toBeVisible();
  await composer.getByRole("button", { name: "Show trimmed content" }).click();
  await expect.poll(async () => /On [^\n]*? wrote:/.exec(await composer.innerText())?.[0] ?? "").toContain("Dave Okafor");
  await composer.getByRole("button", { name: "Discard draft" }).click();
  await page.getByRole("button", { name: "Discard", exact: true }).click();
  await expect(composer).toHaveCount(0);

  // j opens the row below, k the one above.
  await page.locator(".conv-page h1#conv-subject").focus();
  await page.keyboard.press("j");
  await expect(page).toHaveURL(new RegExp(`/${below}$`));
  await expect(cards(page)).toHaveCount(1);
  await page.locator(".conv-page h1#conv-subject").focus();
  await page.keyboard.press("k");
  await expect(page).toHaveURL(new RegExp(`#inbox/${threadId}/${n.id}$`));

  // Archive moves this message only; Undo puts it back.
  await page.getByRole("toolbar", { name: "Conversation actions" }).getByRole("button", { name: "Archive" }).click();
  await expect(page).toHaveURL(/#inbox$/);
  await expect(page.getByRole("status").getByText("Message archived.")).toBeVisible();
  await expect(row(page, n.id)).toHaveCount(0);
  await expect(row(page, o.id)).toBeVisible();
  await expect.poll(async () => (await jmapState([n.id])).get(n.id)?.inInbox).toBe(false);
  expect((await jmapState([o.id])).get(o.id)?.inInbox).toBe(true);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect.poll(async () => (await jmapState([n.id])).get(n.id)?.inInbox).toBe(true);
});

test("archiving two rows says 2 messages; the selection and Select all count messages", async ({ page }) => {
  const [o, n] = three as [Original, Original, Original];
  await start(page);
  await row(page, o.id).getByRole("checkbox", { name: "Select" }).check();
  await row(page, n.id).getByRole("checkbox", { name: "Select" }).check();
  await expect(page.getByText("2 messages selected")).toBeAttached();
  await page.getByRole("toolbar", { name: "Conversation actions" }).getByRole("button", { name: "Archive" }).click();
  await expect(page.getByRole("status").getByText("2 messages archived.")).toBeVisible();
  await expect.poll(async () => [...(await jmapState([o.id, n.id])).values()].map((s) => s.inInbox)).toEqual([false, false]);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect.poll(async () => [...(await jmapState([o.id, n.id])).values()].map((s) => s.inInbox)).toEqual([true, true]);
  await expect(row(page, n.id)).toBeVisible();

  await page.getByRole("checkbox", { name: "Select all" }).check();
  await expect(page.getByText(/^All [\d,]+ messages shown are selected\.$/)).toBeVisible();
  await page.getByRole("button", { name: /^Select all [\d,]+ messages in Inbox$/ }).click();
  await expect(page.getByText(/^All [\d,]+ messages in Inbox are selected\.$/)).toBeVisible();
  await page.getByRole("button", { name: "Clear selection" }).click();
});

test("with conversation view on, a row is still a conversation (unchanged)", async ({ page }) => {
  await stubOutsideWorld(page.context());
  await signIn(page);
  await goTo(page, "#inbox");
  await expect(page.getByRole("grid", { name: "Conversations in Inbox" })).toBeVisible();
  await expect(row(page, threadId)).toBeVisible();
});
