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
- corpus: this brief's outcome, `corpus/wiki/status.md`, `corpus/wiki/glossary.md` (a
  **Message row** entry, if it helps), `corpus/log.md`, and the todo's status

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

## Outcome (2026-10-28)

Done, in `8038b0e`.

- **The route.** A third segment names the message beside the conversation:
  `#inbox/<conversationId>/<messageId>`, and the same after `#label/<id>` and
  `#search/<query>` (`messageId` on the three mail routes in
  `web/src/shell/router.ts`; `withConversation(route, id, messageId?)`, and
  `withoutConversation` drops both). Beside, not in place of, the Thread id:
  `conversationId` keeps meaning the Thread everywhere (the conversation
  store, the open row, snooze, the label menus' `current`), and a URL stays
  unambiguous whatever the pref is. The rule: **the route decides what the
  reader shows, the pref decides what the list writes into the route.** A
  link naming only the conversation (a desktop notification, "View message"
  after sending, an old bookmark) still shows the whole conversation with the
  pref off, and its toasts say "conversation".
- **The reader.** `ConversationView` shows the named message alone, open,
  under the conversation's subject, with no "N messages in Trash or Spam"
  note; a message the conversation no longer has shows "This message doesn't
  exist". It marks only that message read, and its toolbar, Reply, Reply all,
  Forward and the keys act on it. `list/openMessage.ts` lost brief 22's
  scroll-and-hold, which nothing used any more.
- **Labels.** `Thread/get` cannot fetch by a message id, so the reader lends
  its one-message conversation to the label resolver under the message's id
  (`lendConversation` in `web/src/labels/conversations.ts`); the toolbar's
  menus and the `l` / `v` keys hand over that id (`messageId` on the
  conversation controller). It works with the list off screen.
- **`j` / `k`** in the reader open the next and previous message rows. The
  list hands its rows to `list/openMessage.ts` while it is mounted and they
  stay when it unmounts, so this works with the reading pane off (the
  default). After a reload in the reader nothing is held, and `j` / `k` do
  nothing until the list has been shown once.
- **Snooze.** The reader has no snooze button in either mode; the list
  toolbar's Snooze already acted on message rows since brief 22.
- **The copy** counts messages with the pref off: every toast in
  `web/src/actions/` and the label toasts in `useLabelOps.ts` ("Message
  archived.", "2 messages archived.", the "Couldn't …" forms), the selection
  count, both Select all banners, the grid's name ("Messages in Inbox"), the
  delete-forever confirmation, the loading and error lines, and the empty
  states ("No messages in Inbox", "No starred messages", "No messages match
  this search", "No message selected"). The toasts' templates carry tokens
  (`{Thing}`, `{things}`) filled when the toast is made (`actions/copy.ts`,
  which `spam.ts` and `snooze.ts` now share instead of their own copies);
  the runner takes the noun from the pref through `useMailActions`, or from
  the caller (the reader passes what it shows). Copy that quotes a label's
  name builds its strings itself, so a label called `{things}` stays as it
  is. With the pref on every string is as it was. The list toolbar keeps
  its accessible name "Conversation actions", and the help sheet still says
  "Next conversation" for `j`.

Files outside the brief's list, each for one of its lines: `actions/copy.ts`
(new), `runner.ts`'s `noun` dep and option, `useMailActions.ts` (the noun),
`labels/conversations.ts` (the lend), `conversation/registry.ts` (two
optional controller fields), `keys/ShortcutsHost.tsx` (`j` / `k` and the label
keys in the reader), `list/ListRoute.tsx` and `search/SearchRoute.tsx` (their
empty states). Two router test cases that said a second segment after the
conversation is no route now say a third one is not; the pref-off list tests
of brief 22 that checked the old copy and the old opening now check the new.
Every pref-on test is untouched.

What Gmail does that this leaves out: Gmail's reader has Newer / Older arrows
and an "N of M" counter in its toolbar; Postern's has neither, in either mode
(`j` / `k` only). A reply draft in progress in the conversation still opens as
the inline composer under the message shown, as it does in the whole
conversation (brief 08); Gmail lists drafts as their own rows.

Checked:

- `npm run typecheck`, `npm run lint`, and 1272 unit and integration tests
  with the dev Stalwart up (new: the single-message reader, `openMessage`,
  the copy tokens, the runner's noun, the route's third segment).
- `npm run build` and the browser suite, 40 passed, the mailbox restored to
  the manifest's counts. The new `web/e2e/conversation-view-off.spec.ts`
  makes the three newest Inbox messages of "Q4 roadmap review" unread for the
  run (and puts them back): they are three rows; opening the middle one shows
  only it and only it turns read; a reload shows the same message (brief 27
  is not built yet, so the reload asks for the password again and the hash
  brings the message back); Back returns to the list with that row read;
  Reply quotes that message (Dave's), not the conversation's newest
  (Carol's); `j` / `k` open the rows below and above; Archive moves only it
  and Undo puts it back; archiving two rows toasts "2 messages archived.";
  the selection says "2 messages selected" and Select all says messages.
  With the pref on, the Inbox still names its grid "Conversations in Inbox"
  and lists the conversation as one row.

brief-board is down (since 2026-10-13), so nothing was posted there.
