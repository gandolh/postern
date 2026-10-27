---
title: Conversation view off (one row per message)
created: 2026-10-20
status: promoted
tags: [list, settings]
---

Promoted 2026-10-23 into [brief 22](../briefs/done/22-conversation-view-off.md).

# Conversation view off (one row per message)

Gmail lets you turn conversation view off, so the list shows one row per
message instead of one per conversation. Brief 12 left the setting out,
because the list (brief 06) is built on conversations: its rows, selection,
actions and undo all work on a thread's messages.

## Context

On JMAP this is `Email/query` without `collapseThreads`. The list store and
the planners in `web/src/actions/` would need a mode where a row is a single
message, and the setting would live in the per-device prefs
(`web/src/prefs/`, see [decisions-mail.md](../wiki/decisions-mail.md)).
