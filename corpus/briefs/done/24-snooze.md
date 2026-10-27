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

## Outcome (2026-10-27)

Done, in `b062fa9`.

**Step 1, against the dev Stalwart (0.16.25), 2026-10-27:** nothing moves or
flags a message at a time. The Sieve extensions are the stock set (`date` only
tests the time at delivery, `imapsieve` fires on IMAP actions, not on a clock),
the `urn:stalwart:jmap` capability is empty, and no JMAP call sets a timer. So
nothing went to the owner first, and the browser version was built. One
indirect route exists, and it is for the owner to weigh later: schedule send's
FUTURERELEASE (brief 23) could deliver a held self-addressed message into the
conversation at the wake-up time, even with Postern closed. The cost is an extra
message in the thread, on the phone too.

**Built:**

- **State on the server.** A top-level mailbox named "Snoozed",
  unsubscribed so IMAP clients leave it out, made on first snooze
  (`web/src/snooze/label.ts`, like All Mail; a "Snoozed" folder that exists
  already is used). Each snoozed message also gets `$snoozed-<UTC minute>`
  (`$snoozed-20261024T0600Z`). Stalwart keeps the case and took a
  309-character keyword.
- **Snoozed in the navigation**, between Starred and Sent, as a system view:
  `#snoozed` in `web/src/shell/router.ts`, its icon in `Nav.tsx`, and the
  labels store (`web/src/labels/labelsStore.ts`) finds the mailbox by name.
  That keeps it out of the user labels, the label menus, Move to and the
  filters. The list over it has no Archive button (nothing in it is in the
  Inbox).
- **Actions.** `planSnooze` and `planUnsnooze` (`web/src/actions/snooze.ts`)
  run through the runner like archive, so the toast's Undo and `z` work. The
  toolbar's Snooze menu (`web/src/snooze/SnoozeMenu.tsx`) offers Later today
  (+3 h, to the nearest hour), Tomorrow 08:00, This weekend (Saturday 08:00),
  Next week (Monday 08:00) and Pick date and time, in the browser's time zone.
  It leaves out Later today once that would fall tomorrow, and This weekend
  at the weekend. Its help line says once that snoozed mail comes back when
  Postern is open, and it offers Unsnooze when the selection is snoozed. A
  snoozed row carries a "Snoozed until Tue 08:00" chip.
- **Waking** (`web/src/snooze/wake.ts`, run by `SnoozeHost`, which
  `web/src/shell/Shell.tsx` now renders). It looks once the labels are in,
  every minute, a second after a wake-up time, on window focus and after mail
  changes (throttled to one look per 5 s, with a trailing look). Each look is
  one request: the messages in Snoozed, their conversations and the `$woken`
  ones. A conversation whose time has passed goes back to the Inbox with its
  newest message unread. One with a message in the Inbox (a reply) goes back
  at once. A second device finds nothing left in Snoozed, and a patch that
  changes nothing is never sent.
- **"At the top of the Inbox"** needed more than the brief said: a message's
  `receivedAt` can't change, so a woken conversation would go back to its old
  date. The woken message gets `$woken`, and the Inbox now sorts
  `hasKeyword $woken` first, then newest (`web/src/list/view.ts`; Stalwart
  sorts with it and computes `queryChanges`). `$woken` goes once the
  conversation is read or leaves the Inbox. Unlike Gmail, mail that arrives
  after the wake-up sorts below it until then.

Not done, for the owner:

- Snooze from inside an open conversation, and Gmail's `b` key: the
  conversation view and the keys belong to other briefs.
- Moving a snoozed message out of Snoozed by hand (Move to, or an IMAP
  client) leaves its time keyword behind. It does nothing, but stays.
- On a phone-width list the label chips are hidden, the snooze chip with them.

Checked:

- `npm run check`: 1228 tests. The first run lost two user-event tests (the
  schedule-send composer test and `FiltersSettings`) to the 5 s timeout while
  the machine's load was about 7; the composer test now has 20 s, and the
  rerun passed all of them.
- `npm run test:e2e`: 34 passed.
- In Chromium through the UI, with a Playwright script kept outside the repo:
  "Your parcel is ready to collect" was snoozed 2.5 min ahead (the next whole
  minute plus two) with Pick date and time. It left the Inbox, showed in
  Snoozed with its time, and showed in Snoozed in a second browser too. It came
  back 4 s after its time, unread, as the Inbox's first row. Snoozed again and
  Postern closed, it was still snoozed on the server 20 s past the time, and
  came back 1 s after Postern was opened (sign-in included). Snoozed until
  tomorrow, it came back 2 s after bob replied. A first run found two faults,
  both fixed: the first look ran before the labels were in, and a reply right
  after a snooze fell inside the throttle with no look after it. Afterwards the
  conversation was put back exactly as it was, bob's reply was removed, and
  the empty Snoozed label was deleted.

brief-board is down (since 2026-10-13), so nothing was posted there.
