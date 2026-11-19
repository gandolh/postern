# Task 06: The schedule-send test checks what it scheduled

**Depends on:** nothing. **Runs after:** brief 05 (the compose-send tests read by id).

**Before you start:** run `brief-board guide` (the repo's `CLAUDE.md` says so).

Promoted 2026-11-19 by the controller (a test fix with one obvious shape), from the todo `todos/schedule-send-test-can-pass-on-an-empty-search.md` (deleted at closeout).

## Context

`web/test/integration/schedule-send.test.ts:123` calls `(await find(a, TAG)).every(...)` right after scheduling. Stalwart's search index trails writes by a few milliseconds ("Search trails writes" in [wiki/gmail-on-jmap.md](../../wiki/gmail-on-jmap.md)), so when the index is behind, `find` returns an empty list and `every` passes without checking anything.

## Decisions

- Read what the test just wrote by id (or by mailbox), as brief 05 did for compose-send. No app change: the app's reads use `inMailbox` and `hasKeyword`.
- Look through the other integration tests for the same `find(...).every(...)` or `.some(...)` shape on a fresh write; fix each the same way and list them.

## Files you OWN

- `web/test/integration/` and its helpers. Corpus: `corpus/wiki/status.md`, `corpus/log.md`.

## What to do

1. Fix the test (and any twin); each now fails if the message isn't there (show it: make the write go to the wrong mailbox once, see red, put it back).
2. With the dev Stalwart up as brief 05 ran it: the file 10 times in a row, all pass.

## Acceptance

- [ ] The loop above; `npm run check` exit 0 (CI=1 without Stalwart, as brief 05's controller ran it); `bash corpus/lint.sh` OK.
- [ ] End move `done` (test-only, nothing to deploy).

## Outcome (2026-11-19)

Done on `main`, local commit `1e4a507`; test only, no deploy (board: Done).

- The test reads its two drafts by id (`Email/get`, failing on a missing id) and checks
  bob's Inbox by `inMailbox` for "nothing arrived yet" and "only the kept one". It
  records every id it makes (alice's drafts, bob's copy) so the sweep does not rely on
  the search index; the index-behind sweep had left two messages in bob's Inbox and made
  the next compose-send run fail on its count check.
- Seen red: with the drafts built into the Inbox instead of Drafts, the test fails
  (`expected undefined to be true`); put back, it passes.
- Loop: 10 of 10 alone, twice (before and after the sweep fix). `npm run check` exit 0
  with Stalwart up (1,322 tests) and `CI=1` without it (33 skipped).
- Twins: none. compose-send was fixed by brief 05; list-actions has only `rows.find` on
  data it did not just write.
