---
title: Inbox category tabs (Primary, Social, Promotions, Updates)
created: 2026-10-09
status: open
tags: [gmail-parity, needs-server]
---

# Inbox category tabs (Primary, Social, Promotions, Updates)

Gmail splits the Inbox into tabs by a classifier.

## Context

Stalwart has no such classifier. The best approximation is rules on headers,
which Postern could generate as Sieve into hidden labels:

- `List-Unsubscribe` or `Precedence: bulk` → Promotions or Updates;
- known social senders → Social.

Decide whether an imperfect split is worth having before writing a brief.
