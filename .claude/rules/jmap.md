---
paths:
  - "jmap/src/**"
  - "jmap/test/**"
---

# Editing the JMAP client

Run `npm run check:fast` before handing back.

- Plain TypeScript: no React, no DOM, no import from `web`. ESLint enforces it (`no-restricted-imports`
  in `eslint.config.js`).
- The RFCs (8620, 8621) and Stalwart's docs win over the wiki
  ([corpus/CLAUDE.md](../../corpus/CLAUDE.md), "Source of truth").
- A test that needs a server is `describe.skipIf(!live)` against the local Stalwart, never the real mailbox.
  Without the local server those tests skip, so a green `npm run check` can mean they did not run.
- A `!` is an error here: narrow instead (`charAt`, a default, a destructured first item). In a test it is a warning.
