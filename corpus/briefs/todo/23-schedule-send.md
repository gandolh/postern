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
