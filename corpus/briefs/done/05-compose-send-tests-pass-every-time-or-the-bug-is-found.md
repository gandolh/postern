# Task 05: The compose-send tests pass every time, or the bug behind them is found

**Depends on:** nothing. Needs the local mail server (`npm run dev:mail`,
Docker) and its seed.

**Before you start:** run `brief-board guide` ([corpus/CLAUDE.md](../../CLAUDE.md)).

Promoted 2026-11-19 from the todo of 2026-11-12
(`todos/compose-send-integration-failures.md`, deleted at closeout: this brief replaced it),
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

## Outcome (2026-11-19)

Done on `main`, local commit `d90590a` and the corpus commit that moves this
brief. Only the test file changed, so no deploy (board: Done).

- **The cause.** Stalwart 0.16.25 indexes new mail for search in the
  background. An `Email/query` with a `subject` condition sent right after an
  `Email/set` create can come back without the new message, while `Email/get`
  by id, `inMailbox`, `hasKeyword` and `Thread/get` see it at once. The first
  test read its fresh draft with a subject search, so when the index was a few
  milliseconds behind it got `[]`. The value in the failure (`'laqaaacyf'`)
  was the draft's email id, not an inline image's content id: the draft was
  saved whole and never sent. The second test then waited for mail that never
  left until Vitest's 5 s limit, and the third read `messageId` of the
  missing copy. One cause, three failures.
- **Ruled out.** A draft losing its inline part (read by id, the structure was
  complete every time); slow delivery to bob ("reaches bob" took at most 27 ms
  over 39 passing runs, so the 5 s limit stays); the mailbox state (the seed's
  counts matched before and after every red run).
- **The loop's numbers.** Before the fix, the file alone: 20 of 20 runs passed
  on a quiet machine; beside a full `npm run check`, 19 of 20, and the red run
  (during the check's lint phase, before its Vitest) showed the three failures
  above. A throwaway harness (save a draft, then a subject query and an
  `inMailbox` query in one request): the subject query missed 3 and 5 of 200
  saves on a quiet server and 43 to 47 of 50 behind 200 new messages in bob's
  account; `inMailbox`, `hasKeyword` and `Thread/get` missed none. The new
  draft became searchable 4 to 52 ms after its save. After the fix: 20 of 20
  quiet and 15 of 15 beside a full check, every test; three full
  `npm run check` runs with the local Stalwart up, exit 0, 1,322 tests, none
  skipped.
- **The fix, in the test.** The file reads its own writes by id (`read` with
  `Email/get`; `Thread/get` for alice's three copies; the never-sent check
  lists all of bob's mail), and searches only to poll for delivered mail and
  to sweep up, which also destroys every id the tests recorded.
- **The loop kept.** "Reads a just-saved draft back while the search index is
  behind": three rounds of 200 new messages in bob's account, then alice's
  draft read back by id. With the read swapped back to the subject search it
  failed 19 of 20 runs (five rounds did no better, so it stays at three).
- **The app is not affected.** Its reads after its own writes use `inMailbox`
  and `hasKeyword` (`web/src/send/schedule.ts`, `web/src/snooze/wake.ts`,
  `web/src/live/LiveHost.tsx`); search and the retroactive filter search only
  older mail. No change under `web/src`.
- **Seen, not changed** (outside this brief's files):
  `web/test/integration/schedule-send.test.ts` checks
  `(await find(a, TAG)).every(...)` right after scheduling; an index behind
  makes that list empty and the check pass without checking. Its other
  searches poll or wait 5 s first.
