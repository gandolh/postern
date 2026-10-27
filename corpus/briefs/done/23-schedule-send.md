# Task 23: Schedule a message to send later

## Context

Promoted 2026-10-23 from the todo [scheduled-send](../../todos/scheduled-send.md).

Gmail's "Schedule send": pick a time, and the message waits in a Scheduled list
until then. JMAP `EmailSubmission` has `sendAt` (RFC 8621 §7), and SMTP has
FUTURERELEASE (RFC 4865). Whether Stalwart 0.16 honours a future `sendAt` is
**not known**, so this brief starts by finding out, and stops if it doesn't.

How sending works now (checked 2026-10-23):

- [`web/src/send/submit.ts`](../../../web/src/send/submit.ts) creates the
  submission with `EmailSubmission/set`, and `onSuccessUpdateEmail` files the
  message in Sent and drops `$draft` as soon as the server accepts it. Its comment
  notes Stalwart 0.16.25 answers at once with `undoStatus: "pending"` and queues
  the message.
- Undo send is held **in the client** ([`undoDelay.ts`](../../../web/src/send/undoDelay.ts),
  up to 30 s), not on the server, so nothing today relies on a server-side
  cancel.
- The local Stalwart is in `dev/` (`npm run dev:mail && npm run dev:seed`), with
  two accounts on `postern.test`. Never test against a real mailbox.

## Files you OWN

- `web/src/send/` (a scheduled variant of submit, and its test)
- `web/src/composer/` (the Send button's menu with "Schedule send" and a time
  picker)
- `web/src/list/view.ts` and the sidebar entry for a **Scheduled** view
- `jmap/src/methods/submission.ts` and `jmap/src/types/methods.ts` (`sendAt`,
  `EmailSubmission/query` by `undoStatus`, if missing)
- corpus outcome, `status.md`, `log.md`, and a short finding on a wiki page about
  what Stalwart does with `sendAt`

## Files you must NOT touch

- `dev/plan.ndjson` and production's mail config in `../vps-deploy`: if Stalwart
  needs a setting to hold messages, write it down for the owner instead.
- The client-side undo delay.

## What to do

1. **Check against the dev Stalwart first.** Send from one test account to the
   other with `sendAt` three minutes ahead. Record: does `EmailSubmission/set`
   accept it; does the message arrive before or at that time; what `undoStatus`
   reads meanwhile; does `EmailSubmission/set` with `undoStatus: "canceled"` stop
   it; does `EmailSubmission/query` list it; does it survive a Stalwart restart.
2. **If Stalwart sends it early or refuses it, stop here.** Write the finding to the
   wiki and the outcome note, move this brief to `superseded/` with that note, and
   reopen the todo with the result. Don't build a client-side scheduler.
3. If it holds the message: "Schedule send" in the Send button's menu offers
   "Tomorrow morning (08:00)", "Tomorrow afternoon (13:00)", "Monday morning
   (08:00)" and "Pick date and time", in the account's time zone.
4. A scheduled message must not land in Sent until it goes. Don't use
   `onSuccessUpdateEmail` to file it at once; keep it in Drafts with a `$scheduled`
   keyword (or whatever step 1 shows works) and file it in Sent when the
   submission's `undoStatus` becomes `final`, via the live updates.
5. A **Scheduled** view lists pending submissions with their send time. Opening one
   offers "Cancel send", which cancels the submission and leaves it as a draft.

## Acceptance

- Step 1's findings are written down, whatever they are.
- If built: a message scheduled 3 minutes ahead in the dev stack arrives at that
  time, not before; it shows in Scheduled until then and in Sent after.
- Cancel send before the time leaves a draft and nothing is delivered.
- `npm run typecheck`, `npm run lint`, `npm test` and the browser tests pass.

## Outcome (2026-10-27)

Done, in `6973a4f`. Stalwart holds the message, so the brief was built, not
superseded.

**Step 1, against the dev Stalwart (0.16.25), 2026-10-27:**

- `EmailSubmission/set` refuses a `sendAt` from the client (`invalidProperties`,
  "Field could not be set"). It accepts FUTURERELEASE (RFC 4865) instead:
  `HOLDUNTIL` (or `HOLDFOR`) in the envelope's `mailFrom.parameters`. The
  account advertises `maxDelayedSend` 2592000 (30 days).
- Meanwhile the submission reads `undoStatus: "pending"`, `sendAt` the hold
  time, `deliveryStatus` "queued".
- Messages held 3 and 4 minutes arrived 11 s and 3 s after their time; through
  the UI later, 19 s after. Never before.
- `undoStatus: "canceled"` stops it, and it never arrives. Canceling one that
  has gone (or was canceled) answers `cannotUnsend`.
- `EmailSubmission/query` filters by `undoStatus` and `emailIds`; sorting by
  `sendAt` is `unsupportedSort`.
- A container restart one minute in changed nothing: both held messages went
  on time.
- After release `undoStatus` reads "final", but the `EmailSubmission` state
  does not change and no push comes; it is worked out when asked.
  `onSuccessUpdateEmail` works on create but does nothing on an update.

**Built:**

- `web/src/send/schedule.ts`: `scheduleDraft` (every To/Cc/Bcc address in
  `rcptTo`, which a client envelope must list; `$scheduled` set through
  `onSuccessUpdateEmail`), `cancelScheduled` (cancel, then drop the keyword in
  a second call), `listScheduled`, the time presets and checks, and
  `ScheduledSync`.
- **Filing in Sent.** "Via the live updates" can't work, since nothing changes
  on release. `ScheduledSync`, started by the composer store where the account
  can schedule, reconciles at start-up, on window focus, 15 s after the next
  send time (backing off from 30 s, doubling to 15 min, while one is overdue),
  and whenever the Scheduled page looks. A final submission's message is filed
  in Sent like an ordinary send. One whose submissions are all canceled, or
  gone, is a plain draft again. A message that goes out while Postern is
  closed stays in Drafts, marked, until Postern next opens.
- **The composer.** A menu beside Send, only where the account has
  `maxDelayedSend`: Schedule send opens a dialog with Tomorrow morning (08:00),
  Tomorrow afternoon (13:00), Monday morning (08:00) and Pick date and time
  (date and time fields, at least a minute ahead and within the server's
  limit). Postern has no account time zone, so the times are the browser's.
  Send's checks and questions run first. The toast says when it goes, and its
  Undo (and `z`) cancels.
- **Scheduled** at `#scheduled`: a route kind like `#contacts`, in
  `web/src/shell/router.ts`, `Nav.tsx` (after Drafts) and `MainArea.tsx`, with
  the page in `web/src/send/ScheduledRoute.tsx`. It lists pending submissions
  of `$scheduled` messages, soonest first, with recipients, subject and time.
  Opening one shows Cancel send. A message that has gone leaves for Sent.
- **No double send.** Drafts (`web/src/list/view.ts`) leaves `$scheduled`
  messages out, and `threadDrafts` / `draftOnlyConversation` never treat one as
  a draft, so neither the inline reply nor a composer window opens it for
  editing.
- `jmap/src/types/submission.ts`: the comments now say `sendAt` is refused and
  how to hold a message.
- **A bug from brief 21:** `.compose-menu-positioner` sat at z-index 10, under
  the docked composer's layer (55), so More options opened behind the window
  (a pointer hit test in Chromium found the formatting toolbar on top). Both
  composer menus are at 80 now and on top.

Left for the owner:

- The Drafts count in the navigation still counts scheduled messages.
- A scheduled reply doesn't show in its conversation until it has gone: the
  conversation hides drafts in Drafts, as for any reply draft.
- Production: the menu and Scheduled show only if production's Stalwart
  advertises `maxDelayedSend` too. The dev plan doesn't set it, so it is
  Stalwart's default; nothing was checked in `../vps-deploy`.

Checked:

- `npm run check`: 1211 tests, including the new
  `web/test/integration/schedule-send.test.ts` against the dev Stalwart: two
  messages held 20 s, one canceled; bob has nothing at +5 s; the other arrives
  at its time and is filed in Sent; the canceled one never arrives and is a
  plain draft again. It destroys what it made and checks the counts.
- `npm run test:e2e`: 34 passed.
- In Chromium through the UI, with a Playwright script kept outside the repo:
  two messages to bob scheduled 3.5 min ahead with Pick date and time; both
  listed in Scheduled; Cancel send on one left it a plain draft; bob had
  nothing 20 s before the time; the kept one arrived 19 s after it, then left
  Scheduled for Sent; the canceled one never came. Everything was removed
  afterwards, and alice's counts matched `dev/seed/manifest.json`.

brief-board is down (since 2026-10-13), so nothing was posted there.
