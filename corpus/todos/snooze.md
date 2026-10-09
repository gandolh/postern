---
title: Snooze a conversation until a chosen time
created: 2026-10-09
status: open
tags: [gmail-parity, needs-server]
---

# Snooze a conversation until a chosen time

Gmail's Snooze hides a conversation and brings it back to the top of the Inbox
at a chosen time.

## Context

Nothing in JMAP or Stalwart 0.16 schedules a message's return. A client-only
version would move the conversation to a hidden "Snoozed" label, keep the
wake-up time somewhere, and move it back. It would only fire while Postern is
open, so a laptop that stays shut skips the wake-up until it is opened again.

Options, before this becomes a brief:

- client-only, accepting that limitation;
- a Sieve or Stalwart-side mechanism, if Stalwart has one (check its scheduled
  tasks);
- a tiny scheduler service, which would break "no backend of our own" and is
  the owner's call.
