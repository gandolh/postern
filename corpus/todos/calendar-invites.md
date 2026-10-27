---
title: Show calendar invites and answer them from the message
created: 2026-10-09
status: promoted
tags: [gmail-parity, to-check]
---

Promoted 2026-10-23 into [brief 25](../briefs/done/25-calendar-invite-card.md); the owner chose a card and a reply only, no calendar in Postern.

# Show calendar invites and answer them from the message

Gmail shows an invite card (time, place, Yes / No / Maybe) on a message
carrying a `text/calendar` part.

## Context

Stalwart 0.16 advertises the JMAP calendars capability and has a
`/calendar/rsvp` endpoint. Check what it does with an incoming iMIP invite,
and whether a reply can be sent through JMAP. Then decide whether Postern
shows invites only or also keeps a calendar.
