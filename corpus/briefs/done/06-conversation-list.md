# Task 06: The conversation list

## Context

Gmail's main screen: one row per conversation, newest first, with fast bulk
actions. On JMAP that is `Email/query` with `collapseThreads: true`, plus
`Email/get` for the row fields. The archive and star semantics are in
[gmail-on-jmap.md](../../wiki/gmail-on-jmap.md) and
[decisions.md](../../wiki/decisions.md). Archive means leaving the Inbox, and a
message with no other label goes to All Mail.

## Files you OWN

- `web/src/list/**`: the list, row, toolbar, selection, undo toast
- `web/src/actions/**`: archive, delete, mark read and unread, star, important,
  move to Spam or Trash, as functions over `@postern/jmap`

## What to do

1. **Each row**, all from one batched request per page:
   - checkbox, star and important marker;
   - senders (Gmail-style "me, Bob, Carol (5)"), subject — snippet;
   - label chips (not the current label), attachment icon, date (time today,
     date otherwise).
   - Unread rows are bold.
2. **A virtualised list** with paging by `position` and `limit` (50). Smooth on
   alice's 2,000+ seeded messages.
3. **Selection.**
   - Click, shift-click ranges, and select all / none / read / unread /
     starred.
   - "Select all conversations that match" beyond the loaded page, as in
     Gmail.
4. **The toolbar** for a selection: archive, report spam, delete, mark read or
   unread, snooze (disabled; it is a todo), label (brief 09), move to.
5. **Hover actions** on a row: archive, delete, mark read, star.
6. **Optimistic updates with undo.**
   - Apply locally, send `Email/set`, and roll back on error.
   - The toast reads "Conversation archived. Undo".
   - Undo sends the inverse patch.
7. Pull new state with `/changes` when the window regains focus. Live push
   comes in brief 11.

## Acceptance

- On `dev/`, archive, delete, star and read or unread work for one row and for
  a selection. Each is undoable, and each is visible from an IMAP client
  logged in as alice.
- Archiving a conversation with another label keeps the label. Without one, it
  lands in All Mail.
- Scrolling 2,000 conversations stays smooth, with no more requests than pages
  scrolled.
- Unit tests cover the archive and mailbox-patch logic.

## Outcome (2026-10-20)

Built with a hand-rolled virtual list: scrolling all 2,035 Inbox
conversations took one request per page of 50, at most 26 rows in the DOM,
median frame 16.6 ms. Each action was checked from IMAP and undone; alice's
2,816 messages ended identical to the seed. Choices beyond the spec:

- A conversation's messages "in this view" are Gmail's: everything outside
  Trash and Spam, or in Trash and Spam only their own. Star, read, delete and
  report spam act on that set; archive acts on Inbox membership.
- Delete moves each message to Trash only; undo restores its labels. Delete
  forever (Trash and Spam only) is confirmed and destroys.
- All Mail lists everything outside Spam and Trash
  (`inMailboxOtherThan`). The archive mailbox is created on first need.
- Starring from the row is quiet, as in Gmail, but still undoable with `z`.

Not run against `dev/`, only in unit tests: report spam, not spam and delete
forever. `web/test/` is now typechecked (`web/tsconfig.test.json`). The last
undo is module-level and outlives sign-out (it then fails quietly).
