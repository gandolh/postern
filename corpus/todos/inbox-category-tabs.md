---
title: Inbox category tabs (Primary, Social, Promotions, Updates)
created: 2026-10-09
status: dropped
tags: [gmail-parity, needs-server]
---

Dropped 2026-10-23 by the owner: see "No inbox category tabs" in [decisions-mail.md](../wiki/decisions-mail.md).

# Inbox category tabs (Primary, Social, Promotions, Updates)

Gmail splits the Inbox into tabs by a classifier.

## Context

Stalwart has no such classifier. The best approximation is rules on headers,
which Postern could generate as Sieve into hidden labels:

- `List-Unsubscribe` or `Precedence: bulk` → Promotions or Updates;
- known social senders → Social.

Decide whether an imperfect split is worth having before writing a brief.
