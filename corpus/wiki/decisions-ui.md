---
summary: The calls that changed Postern's layout since the first design. The redesign "The reading desk" (2026-11-13, brief 04) reopened three lines of design.md - the reading pane's default (none to right), the phone's navigation (hidden until the menu opens it, to a bottom bar) and the row density (one-line rows of 48, 40 and 32 px, to three lines of 72, 64 and 52 px) - with the old line kept as history, plus the still loading rows and the canvas colour. Read before changing the layout, the phone navigation or the list rows.
updated: 2026-11-13
---

# Decisions: the layout

## The redesign, "The reading desk" (2026-11-13)

_2026-11-13_, the owner approved the direction on the estate redesign board, with every question on the board
standing as proposed (brief 04). It keeps "Our own webmail, shaped like Gmail" (Gmail has a reading pane and a phone
bottom bar too), the patina on limestone identity, the keyboard model, the sandboxed message frame and both
themes. Three lines of [design.md](design.md) were reopened and changed; the old line stays here as history.

- **Reading pane, changed.** Was: "Reading pane: none, right, below", with `none` the default
  (the list and the conversation stack as routes). Now: the default is `right`
  (`DEFAULT_DISPLAY_SETTINGS`); `none` and `below` stay as settings, a stored choice still wins, and the pane stays
  off on a phone. Why: the list and the reader side by side are what the redesign is for, and a first visit should
  show them.
- **Phone navigation, changed.** Was: "under 600 px it is hidden until the menu opens it" (a menu button in the top bar,
  Compose floating alone). Now: a 64 px bottom bar (Inbox, Starred, Sent, Labels); Labels opens the drawer with the
  whole tree, so the top bar drops its menu button; an open conversation takes the whole screen with its own toolbar,
  and the bottom bar and Compose go. The rail (600 to 1023 px) and the full navigation (from 1024 px) stay. The
  drawer's focus returns to Labels.
- **Densities, changed.** Was: "rows 48, 40 and 32 px, one line each", every row "exactly one `--row-height` tall".
  Now: three lines (senders and date; chips and subject; snippet), 72 px (6 px padding), 64 px (a 12/16 snippet) and
  52 px (no snippet) as floors, a subject that wraps before it is cut, and a virtual list that measures its rows.
  The keyboard model is unchanged.
- **The loading skeleton stops pulsing** (the board's open sticky): the rows draw still, and `--animate-skeleton` and
  `--color-skeleton-shine` are gone.
- **The canvas deepened** (`#e8ebe7`, `#0d110f`), so the `theme-color` metas and the PWA manifest's colours followed it
  (the controller's call, 2026-11-13).

The first layout is recorded in [decisions.md](decisions.md), "Our own webmail, shaped like Gmail"; the result is [design.md](design.md).
