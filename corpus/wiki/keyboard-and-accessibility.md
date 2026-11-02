---
summary: Postern's keyboard shortcuts and accessibility as built on 2026-10-20. One shortcut registry and when it stays quiet, the axe and contrast results, what was fixed, the gaps left, and the owner's by-ear check with NVDA or VoiceOver.
updated: 2026-11-02
---

# Keyboard and accessibility

The targets are in [design.md](design.md); the overlays' focus handling is in
[overlays.md](overlays.md). The code wins where this page and it disagree.

## Shortcuts

Every Gmail shortcut in the spec is bound, plus `Shift+c` for full-screen
compose and `+`/`-` for important, through one registry in `web/src/keys/`
(`shortcuts.ts`, `ShortcutsHost.tsx`, the `?` sheet in `HelpSheet.tsx`). None
fires in a field, a menu or a dialog, with Ctrl, Alt or Meta held, or when
shortcuts are off in settings. The Inbox can be triaged without a mouse:
open, archive, next, reply, send.

## Checked on 2026-10-20

- axe-core 4.10.2 found nothing at any level on every route in both themes,
  after three fixes (a help-sheet scroll region, a small composer button, a
  duplicate banner landmark). The message frames were not scanned.
- Contrast passes for 44 token pairs per theme; the light yellow label colour
  was darkened to pass.
- Focus returns to the row after archive, delete, spam and `u`. Unread rows
  say "Unread" to screen readers.

## Gaps left

- `j`/`k` inside a full-width conversation does nothing (no list is mounted).
- A row's star button reads "Not starred", a double negative.
- A row's accessible name is long.
- Back by link or by the browser doesn't restore the row's focus.
- Search results don't take focus.

## Owner check, by ear

With NVDA or VoiceOver: the Inbox grid announces its name, row count and
position, and unread rows start with "Unread"; selecting with `x` announces
the count; an open conversation reads its subject heading and each collapsed
message's sender, address and date; archiving announces "Conversation
archived" once; then the `?` sheet, the `l` and `v` menus, a hostile message's
forged-sender warning, and "Message sent." after Ctrl+Enter.
