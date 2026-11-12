---
title: Three compose-send integration tests failed against the dev Stalwart, then passed
created: 2026-11-12
status: open
tags: [tests, dev-stalwart]
---

`web/test/integration/compose-send.test.ts` has three tests that failed with the
local Stalwart up and seeded, on the untouched tree before the Base UI brief
(02) began and again at its end, so that work did not cause them. In the last
`npm run check` (2026-11-12, after the failure-toast commit) all three passed,
so the cause may be load or the mailbox's state; the failures were:

- "saves a draft with an attachment and an inline image, replacing it on each
  save": `expected [] to deeply equal [ 'laqaaacyf' ]`, the inline image's
  content id is not found on the saved draft.
- "reaches bob with the same bytes": times out at the 5 s test limit.
- "threads bob's reply and alice's forward in both mailboxes": reads
  `messageId` of an undefined message, most likely because the previous test
  never delivered it.

Rerun just this file with `npm run dev:mail` and `npm run dev:seed` done and the
mailboxes at the seed's counts (the file's first assertion checks the Inbox's
unread count against `dev/seed/manifest.json`, and skips the rest when it
differs):

```sh
npx vitest run web/test/integration/compose-send.test.ts
```

First to find out: whether the dev Stalwart's delivery to bob is slow or
refused (the second test), and whether the draft's inline part is stored with a
different content id (the first). A full `npm run check` shows the same three.
