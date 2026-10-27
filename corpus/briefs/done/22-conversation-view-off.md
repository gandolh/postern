# Task 22: Conversation view off (one row per message)

## Context

Promoted 2026-10-23 from the todo
[conversation-view-off](../../todos/conversation-view-off.md).

Gmail lets you turn conversation view off, so the list shows one row per message
instead of one per conversation ([design.md](../../wiki/design.md) lists it among
the settings). [Brief 12](../done/12-settings.md) left it out because the list
([brief 06](../done/06-conversation-list.md)) is built on conversations: its rows,
selection, actions and undo all work on a conversation's messages.

Where conversations are assumed (checked 2026-10-23):

- [`web/src/list/listStore.ts`](../../../web/src/list/listStore.ts) queries
  `Email/query` with `collapseThreads: true` (lines 198 and 260), and
  [`useListStore.ts:12`](../../../web/src/list/useListStore.ts) puts
  `collapseThreads: true` in the store's cache key.
- The planners in [`web/src/actions/plans.ts`](../../../web/src/actions/plans.ts)
  (`planArchive`, `planTrash`, `planRead`, `planLabels`, `planMove`, …) all take
  `Conversation[]` and a `ConversationScope`
  ([`web/src/actions/conversation.ts`](../../../web/src/actions/conversation.ts)).
- Per-device prefs live in [`web/src/prefs/prefs.ts`](../../../web/src/prefs/prefs.ts)
  (`AccountPrefs`, `PREFS_VERSION = 1`); its header comment says how to add a field.

The cheapest shape: in message mode a row is a `Conversation` holding exactly one
message. Every planner, the undo and the selection then work unchanged, because
they already act on "the conversation's messages in this scope". Check that this
holds before building anything else.

## Files you OWN

- `web/src/list/listStore.ts`, `useListStore.ts`, `Row.tsx`, `ConversationList.tsx`
  and their tests
- `web/src/prefs/prefs.ts`, `prefs.test.ts` (the new field; bump the version only
  if the stored shape needs a migration)
- `web/src/settings/GeneralSettings.tsx`, `settings.test.tsx` (the switch)
- `web/src/actions/` only if a planner turns out not to work on a one-message
  conversation; say which in the outcome

## Files you must NOT touch

- `jmap/`: `Email/query` without `collapseThreads` needs nothing new.
- `web/src/conversation/` (the reading view): opening a message row still opens
  its whole conversation, as Gmail does, scrolled to that message.

## What to do

1. Add `conversationView: boolean` (default `true`) to the per-device prefs, and a
   switch in General settings: "Conversation view: group replies into one row".
2. With it off, the list queries without `collapseThreads`, and the cache key says
   so, so switching never shows one mode's pages in the other.
3. Each row is a one-message `Conversation`: sender, subject, preview and date are
   that message's own; no message count.
4. Opening a row opens its conversation with that message expanded and in view.
5. Check selection, archive, delete, labels, read/unread, star and undo on a
   message row act on that one message only. A conversation with three messages in the
   Inbox shows three rows; archiving one leaves two.

## Acceptance

- With conversation view off, a three-message conversation is three rows, newest first by
  each message's own date.
- Archiving one of them moves only that message; Undo brings it back.
- Turning the switch back on shows one row for the conversation again, without a reload.
- `npm run typecheck`, `npm run lint`, `npm test` and the browser tests pass.

## Outcome (2026-10-27)

Done, in `6e2729b`. The shape held: a message row is a `Conversation` holding
that one message, and every planner, the undo, the selection, the label menus,
drag to a label and the keys act on it alone with no change. Nothing in
`web/src/actions/` was touched.

- **The pref.** `conversationView` (default `true`) in `AccountPrefs`, read
  with `usePrefs()`. No version bump: prefs saved before it read as on. The
  switch in General settings is "Conversation view: group replies into one
  row".
- **The list.** `ListStore` takes `conversationView: false`: `Email/query`
  without `collapseThreads`, and a page is two calls, the query and one
  `Email/get` of the row messages with `MESSAGE_ROW_PROPERTIES` (what the row
  and the actions need), with no `Thread/get`. `queryKey` carries the mode.
  `ConversationList` remounts its body when the pref flips, so a selection or
  focus never carries over from one mode to the other.
- **The row.** `ConversationRow.id` is the row and selection key: the Thread id,
  or the message id with conversation view off. A new `conversationId` names
  the Thread the row opens. Both are in `web/src/list/types.ts`, which the
  brief did not list; the field was the clearest way to stop `id` meaning two
  things. Sender, subject, snippet and date are the message's own, with no
  count.
- **Opening.** `web/src/list/openMessage.ts` (new) waits for the conversation
  to mount, then uses its controller from `conversation/registry.ts` (as brief
  14's keys do) to open the message, unfolding it if it was folded, and scroll
  it to the top. `web/src/conversation/` is unchanged. A reply draft in the
  conversation opens as the inline composer and takes focus a moment later,
  which scrolled to the bottom in the browser check; for 3 s, until the reader
  scrolls, types or clicks, a focus move now brings the message back. The
  highlighted row is the one opened, else the conversation's newest.
- **Search results** follow the pref too: they are the same list.

Left as they were, for the owner to weigh:

- The copy still counts conversations: "Conversation archived.", "1
  conversation selected", "Select all 2,144 conversations in Inbox". The
  toasts live in `web/src/actions/`, outside this brief.
- Opening a message row marks the whole conversation read, because the open
  conversation marks what it shows read on open (brief 07).

Checked:

- `npm run check`: typecheck, lint and 1186 tests (the dev Stalwart was up, so
  the 31 integration tests ran). On the first run `compose-send.test.ts` timed
  out waiting for bob's copy under the load of the parallel unit tests, and
  its two dependent tests failed; the rerun passed all 1186.
- `npm run test:e2e`: 34 passed, mailbox restored to the manifest's counts.
- In Chromium against the dev Stalwart, with a Playwright script kept outside
  the repo and the e2e harness's setup: alice's four Inbox messages of "Q4
  roadmap review" were four rows, newest first; the oldest opened expanded at
  the top of the conversation and stayed in view after the reply draft took
  focus; archiving the second row took only that message out of the Inbox and
  Undo put it back; switching the pref back on showed one row for the
  conversation with no reload. A failed first attempt left that message
  archived; it was put back by hand and the counts checked against
  `dev/seed/manifest.json`.

brief-board is down (since 2026-10-13), so nothing was posted there.
