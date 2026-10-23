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
