---
title: A schedule-send test can pass on an empty search
created: 2026-11-19
status: promoted
tags: [tests, dev-stalwart]
---

# A schedule-send test can pass on an empty search

> Promoted to [brief 06](../briefs/todo/06-the-schedule-send-test-checks-what-it-scheduled.md) on 2026-11-19.

Found by brief 05 (2026-11-19). `web/test/integration/schedule-send.test.ts:123`
calls `(await find(a, TAG)).every(...)` right after scheduling. Stalwart's
search index trails writes by a few milliseconds (see "Search trails writes"
in [wiki/gmail-on-jmap.md](../wiki/gmail-on-jmap.md)), so when the index is
behind, `find` returns an empty list and `every` passes without checking
anything.

Read what the test just wrote by id or by mailbox, as brief 05 did for
compose-send, or assert the list isn't empty before `every`.
