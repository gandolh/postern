# Task 06: The schedule-send test checks what it scheduled

**Depends on:** nothing. **Runs after:** brief 05 (the compose-send tests read by id).

**Before you start:** run `brief-board guide` (the repo's `CLAUDE.md` says so).

Promoted 2026-11-19 by the controller (a test fix with one obvious shape), from the todo [schedule-send-test-can-pass-on-an-empty-search](../../todos/schedule-send-test-can-pass-on-an-empty-search.md).

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
