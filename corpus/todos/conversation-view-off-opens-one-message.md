---
title: With conversation view off, a message row opens that message alone
created: 2026-10-28
status: promoted
tags: [gmail-parity]
---

Promoted 2026-10-28 into [brief 26](../briefs/todo/26-conversation-view-off-opens-one-message.md).

# With conversation view off, a message row opens that message alone

Left by [brief 22](../briefs/done/22-conversation-view-off.md). The owner chose
on 2026-10-28: **show just that message**, as Gmail does with conversation view
off.

Today a message row opens its whole conversation, unfolds and scrolls to the
message, and the conversation marks everything it shows read (brief 07). With
the pref off, opening a row should show only that message in the reader and
mark only it read. The pref on stays as it is.

Same brief, a plain bug: the copy still counts conversations with the pref off
("Conversation archived.", "1 conversation selected", "Select all 2,144
conversations in Inbox"). Say "message" when the pref is off. The toasts live
in `web/src/actions/`.

Also decided on 2026-10-28, nothing to build: snooze stays browser-only. The
held self-addressed message through FUTURERELEASE that brief 24's outcome
offered was turned down, since it leaves an extra message in every snoozed
thread.
