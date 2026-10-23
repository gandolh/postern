# Task 24: Snooze a conversation until a chosen time

## Context

Promoted 2026-10-23 from the todo [snooze](../../todos/snooze.md). The owner chose
on 2026-10-23: if Stalwart has no server-side way to bring mail back, snooze runs
in the browser, accepting that it fires only while Postern is open somewhere. A
small scheduler service was rejected: it would break "No backend of our own".

Gmail's Snooze hides a conversation and brings it back to the top of the Inbox at a
chosen time. Nothing in JMAP (RFC 8620, 8621) schedules a message's return, and
nothing in Stalwart 0.16 is known to (the version is pinned in `../vps-deploy`).

Where it plugs in (checked 2026-10-23):

- Labels are JMAP mailboxes ([glossary](../../wiki/glossary.md)), managed in
  `web/src/labels/` (`labelsStore.ts`, `visibility.ts` for hidden labels).
- List views per label: [`web/src/list/view.ts`](../../../web/src/list/view.ts).
- Conversation actions and undo: `web/src/actions/` (`plans.ts` has `planMove`
  and `planKeyword`).
- Live updates (JMAP push / polling): `web/src/live/`.

## Files you OWN

- `web/src/snooze/` (new): the wake-up check, choosing times, reading and writing
  the snooze keyword
- `web/src/actions/` (a `planSnooze` / `planUnsnooze`, and the menu items)
- `web/src/list/view.ts`, the sidebar entry for **Snoozed**, and the row's "Snoozed
  until …" line
- `web/src/labels/` (creating the hidden Snoozed label on first use, if it needs a
  change there)
- `corpus/.planned-roots` (add `web/src/snooze`), corpus outcome, `status.md`,
  `log.md`, and the finding about Stalwart on a wiki page

## Files you must NOT touch

- `dev/plan.ndjson` and anything under `../vps-deploy`: no server change.
- `jmap/` unless a missing method type is needed.

## What to do

1. **Check Stalwart first** (the dev stack in `dev/`): does 0.16 have anything that
   moves or flags a message at a time (a Sieve extension, a scheduled task, a JMAP
   extension)? Write the finding down. If something exists and needs no server of
   our own, bring it to the owner before using it; otherwise go on below.
2. **Store the wake-up time on the server, not the device**, so every device agrees:
   snoozing moves the conversation's messages from the Inbox to a hidden
   **Snoozed** label and sets a keyword holding the time, for example
   `$snoozed-20261024T0600Z` (keywords allow these characters; check the length
   limit). No `localStorage`.
3. Snooze choices, in the account's time zone: Later today (+3 h, rounded to the
   hour), Tomorrow 08:00, This weekend (Saturday 08:00), Next week (Monday 08:00),
   Pick date and time.
4. **Waking**: while Postern is open, check once a minute and on start-up for
   snoozed conversations whose time has passed. Move each back to the Inbox, mark it
   unread, drop the keyword, so it shows at the top as Gmail's does. Two open
   devices waking the same conversation must not fight: the move is idempotent, so
   the second one finds nothing to do.
5. A reply arriving in a snoozed conversation wakes it at once (the new message lands
   in the Inbox; move the rest back with it and drop the keyword).
6. The **Snoozed** view lists them with "Snoozed until Tue 08:00"; "Unsnooze" moves one
   back now. Undo works for snooze like for archive.
7. Say once, in the snooze menu's help line, that snoozed mail comes back when
   Postern is open.

## Acceptance

- Snooze a conversation for two minutes in the dev stack: it leaves the Inbox, shows
  in Snoozed with its time, and comes back unread at the top of the Inbox on time
  with Postern open.
- With Postern closed past the time, opening it brings the conversation back at once.
- Snoozed on one browser, it shows as snoozed on a second one.
- A reply to a snoozed conversation brings it back straight away.
- `npm run typecheck`, `npm run lint`, `npm test` and the browser tests pass.
