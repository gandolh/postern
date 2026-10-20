# Task 11: Live updates and notifications

## Context

New mail appears in Gmail without a refresh. Stalwart pushes JMAP
`StateChange` events, but only to a request that carries an `Authorization`
header. The browser's `EventSource` cannot send one
([architecture.md](../../wiki/architecture.md)), so brief 03's `fetch()`-based
reader carries the stream. Notifications while the app is closed are brief 16.

## Files you OWN

- `web/src/live/**`: subscribe to push, apply changes to the list,
  conversation and counts; polling fallback; connection status
- `web/src/notify/**`: the tab title and favicon unread badge, opt-in desktop
  notifications

## What to do

1. **On sign-in**, open the push stream for `Email`, `Mailbox` and `Thread`.
   On each `StateChange`:
   - run `Email/changes` and `Mailbox/changes`;
   - run `Email/queryChanges` for the visible list;
   - patch the UI in place, keeping scroll position and selection.
2. **`cannotCalculateChanges`** reloads the visible page only.
3. **Losing the stream.**
   - Reconnect with backoff, and show a quiet "Reconnecting…" in the shell.
   - After repeated failures, fall back to polling the session state every 30 s.
   - Also refresh on window focus.
4. **The unread count** goes in the tab title ("Inbox (3) — Postern") and as a
   favicon badge.
5. **Desktop notifications** are off by default. Turn them on from settings
   (brief 12) with the browser permission prompt. Notify for new Inbox mail
   only, showing sender and subject. Click focuses the conversation.

## Acceptance

- On `dev/`, with Postern open as alice:
  - a message sent from bob appears at the top of the Inbox within 2 seconds,
    without a reload;
  - the unread count and tab title update.
- A change made from an IMAP client (star, move) shows up live.
- Stopping and restarting the dev Stalwart reconnects without a reload.
- Notifications fire only when enabled and only for the Inbox.

## Outcome (2026-10-20)

Built. `LiveHost` runs one push reader per sign-in and feeds every
`StateChange` to the labels store, the lists and (through the actions bus)
the open conversation and search. Measured on `dev/`: SMTP to visible in the
Inbox in 295 ms; an IMAP star showed within 2.5 s. The controller restarted
the dev Stalwart with Postern open: it polled, then reconnected without a
reload, and the next message arrived within 2 s. That check found the Vite
dev proxy holding event-stream headers until the first 30 s ping, which kept
"Reconnecting…" up for half a minute; `web/vite.config.ts` now flushes them.
Desktop notifications are off by default and per device; real permission
prompts could not be tested headless (checked with a stubbed
`Notification`).
