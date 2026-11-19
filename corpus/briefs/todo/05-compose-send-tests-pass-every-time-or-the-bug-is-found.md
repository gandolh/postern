# Task 05: The compose-send tests pass every time, or the bug behind them is found

**Depends on:** nothing. Needs the local mail server (`npm run dev:mail`,
Docker) and its seed.

**Before you start:** run `brief-board guide` ([corpus/CLAUDE.md](../../CLAUDE.md)).

Promoted 2026-11-19 from the todo of 2026-11-12
([todos/compose-send-integration-failures.md](../../todos/compose-send-integration-failures.md)),
on the owner's answer in the backlog grill: promote it as a diagnose brief.

## Context

`web/test/integration/compose-send.test.ts` has three tests that failed
against the seeded local Stalwart, twice (before and after brief 02), and
then passed in the next full `npm run check`:

- "saves a draft with an attachment and an inline image, replacing it on
  each save": the inline image's content id isn't on the saved draft
  (`expected [] to deeply equal [ 'laqaaacyf' ]`);
- "reaches bob with the same bytes": times out at 5 s;
- "threads bob's reply and alice's forward in both mailboxes": reads
  `messageId` of an undefined message, most likely because the previous
  test never delivered.

The first one may be a real bug in the live app (a draft saved while an
inline image is still uploading?), or load, or the mailbox's state between
runs. The file's first assertion checks the Inbox's unread count against
`dev/seed/manifest.json` and skips the rest when it differs.

## Owner decision (2026-11-19)

Find the cause with the `diagnose` skill: a deterministic pass/fail loop
first, then one hypothesis at a time, then the fix, and the loop kept as a
regression test.

## Files you OWN

- `web/test/integration/compose-send.test.ts` and its helpers
- whatever the cause turns out to live in, under `web/src/` or the server,
  if it is a real bug (say so before a change outside the compose path)
- `dev/` seed and setup scripts, if the cause is the mailbox state
- Corpus: the todo (delete it at closeout: this brief replaces it),
  [wiki/status.md](../../wiki/status.md), [log.md](../../log.md)

## What to do

1. Bring up the local mail server and seed (`npm run dev:mail`,
   `npm run dev:seed`), and run the file alone in a loop (20 runs) on a quiet
   machine, then under load (the full `npm run check` beside it). Record
   pass/fail per test.
2. If it never fails: try the states the todo names (mailbox counts off the
   seed, a slow delivery, a draft saved twice quickly) one at a time.
3. Fix what the loop shows: the app if a draft can lose an inline part, the
   test or the seed if the state is the cause. A timeout is raised only with
   a measured reason.
4. Stop the mail server you started (by its compose project, never
   `docker rm` of anything you didn't start).

## Acceptance

- [ ] The outcome names the cause (or what was ruled out, with the loop's
      numbers).
- [ ] The file passes 20 runs in a row alone and 3 full `npm run check`
      runs.
- [ ] A real app bug, if found, has a regression test that fails before the
      fix.
- [ ] End move: `ready_for_deploy` if the web app changed (owner step
      `node cli.ts postern deploy`: Postern is static files), else `done`.
