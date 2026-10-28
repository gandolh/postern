# Task 26 — With conversation view off, a message row opens that message alone

## Context

Promoted 2026-10-28 from the todo
[conversation-view-off-opens-one-message](../../todos/conversation-view-off-opens-one-message.md).
The owner chose on 2026-10-28: **show just that message**, as Gmail does with
conversation view off.

[Brief 22](../done/22-conversation-view-off.md) added the `conversationView` pref.
With it off, the list shows one row per message, but opening a row still opens
the whole conversation: `web/src/list/ConversationList.tsx` (around `:190`)
navigates with `withConversation(route, conversationId)`
(`web/src/shell/router.ts`) and `web/src/list/openMessage.ts` then unfolds and
scrolls to the message. `ConversationView` marks every message it shows read on
open (`web/src/conversation/markRead.ts`, brief 07), so opening one message row
marks the whole conversation read.

With the pref off, Gmail's reader shows only the clicked message and marks only
that one read. Reply, Reply all and Forward act on that message.

A plain bug rides along: the copy still counts conversations with the pref off.
"Conversation archived." and "3 conversations archived." come from the
`ActionCopy` objects in `web/src/actions/` (`runner.ts`, `spam.ts`,
`snooze.ts`) and `web/src/labels/useLabelOps.ts`; "Select all N conversations"
is in `ConversationList.tsx` (`:591`); the toolbar's count is in
`web/src/list/Toolbar.tsx`; the empty states are in `web/src/shell/states.tsx`
and `MainArea.tsx`. The glossary defines **Conversation** and avoids "thread" in
UI copy; a message row is a message, so with the pref off the copy says
"message".

## Files you OWN

- `web/src/list/ConversationList.tsx`, `openMessage.ts`, `Toolbar.tsx`, and
  their tests
- `web/src/shell/router.ts` (a way for the route to name one message, if the
  design needs it), `states.tsx`, `MainArea.tsx`
- `web/src/conversation/ConversationView.tsx`, `markRead.ts`,
  `conversationStore.ts`, `useConversationStore.ts`, and their tests
- The `ActionCopy` objects in `web/src/actions/` and
  `web/src/labels/useLabelOps.ts` (the copy only, not the planners)
- Browser tests for this
- corpus: this brief's outcome, `wiki/status.md`, `wiki/glossary.md` (a
  **Message row** entry, if it helps), `log.md`, and the todo's status

## Files you must NOT touch

- The pref itself and the list query brief 22 built (`listStore.ts`), beyond
  reading `conversationView`.
- The pref on: everything stays as it is.

## What to do

1. **One message in the reader.** With the pref off, opening a message row
   shows that message alone: its card, open, with the conversation's subject
   above it. The route must name the message, so a reload or Back/Forward
   reopens the same one; pick the smallest shape (a message id beside
   `conversationId`, or the message id in its place) and say why in the
   outcome. `openMessage.ts`'s scroll-and-hold exists for the whole-conversation
   case; drop what this makes dead.
2. **Mark only that message read.** `markReadOnOpen` (or its caller) marks the
   one message shown, not the conversation's other unread messages.
3. **Actions on the open message.** Reply, Reply all, Forward, Archive, Delete,
   labels, snooze and the keys act on the one message, as the row's actions
   already do since brief 22. Next and previous in the reader (`j`/`k`) move
   between message rows.
4. **The copy says "message" with the pref off**: toasts ("Message archived.",
   "3 messages archived.", and the "Couldn't …" forms), the selection count,
   "Select all N messages in Inbox", and the empty states. The pref on keeps
   every string as it is.
5. Record in the outcome what Gmail does that this leaves out, if anything.

## Acceptance

- Pref off: a three-message conversation with all three unread is three rows;
  opening the middle one shows only that message, and only that row turns read.
  Reload shows the same message; Back returns to the list.
- Pref off: Reply on the open message quotes that message; Archive moves only
  it; `j`/`k` open the next and previous rows.
- Pref off: archiving two rows toasts "2 messages archived."; the toolbar and
  "Select all" say messages.
- Pref on: opening a conversation and its copy are unchanged (the existing
  tests pass untouched).
- `npm run typecheck`, `npm run lint`, `npm test` and the browser tests pass,
  against the local Stalwart in `dev/`.
