---
title: Schedule a message to send later
created: 2026-10-09
status: promoted
tags: [gmail-parity, to-check]
---

Promoted 2026-10-23 into [brief 23](../briefs/done/23-schedule-send.md).

# Schedule a message to send later

Gmail's "Schedule send": pick a time, and the message waits in a Scheduled
label until then.

## Context

JMAP `EmailSubmission` has `sendAt`, and SMTP has FUTURERELEASE (RFC 4865).
Check whether Stalwart 0.16 honours a future `sendAt` and holds the message in
its queue. Also check what `EmailSubmission/set` with `undoStatus` "canceled"
does before then. If it works, this becomes a small brief on top of 08.
