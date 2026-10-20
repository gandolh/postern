# Task 14: Keyboard shortcuts and accessibility

## Context

Gmail's keyboard shortcuts are a large part of why heavy users stay. Postern
copies the common set, toggled in settings (brief 12, on by default). The
accessibility targets in [design.md](../../wiki/design.md) are checked here
across everything built so far.

## Files you OWN

- `web/src/keys/**`: the shortcut registry, sequences (`g` then `i`), the
  help sheet
- Fixes in any `web/src/**` component found by the accessibility pass. Keep
  each fix small and in the component's own file.

## What to do

1. **Shortcuts:**
   - `c` compose, `/` search, `?` the help sheet;
   - `j` / `k` next and previous conversation, `o` or Enter open, `u` back to
     the list, `n` / `p` next and previous message in a conversation;
   - `e` archive, `#` delete, `!` report spam, `s` star, `x` select;
   - `Shift+i` / `Shift+u` mark read or unread;
   - `r` reply, `a` reply all, `f` forward;
   - `l` label, `v` move to, `z` undo;
   - `g` then `i` / `s` / `t` / `d` / `a`: go to Inbox, Starred, Sent, Drafts,
     All Mail;
   - `Ctrl+Enter` sends from the composer;
   - Escape closes menus and dialogs.

   Shortcuts never fire while typing in a field.
2. **The help sheet** lists the shortcuts grouped as in Gmail, and is
   searchable.
3. **The accessibility pass** (WCAG 2.2 AA):
   - the list as a grid with row selection;
   - roving focus, visible focus rings, focus kept or restored after archive
     and delete;
   - live-region announcements for toasts;
   - labelled icon buttons, dialogs with focus traps;
   - contrast in both themes; the zoom (200%) layout;
   - `prefers-reduced-motion`.
4. Run axe in the browser on every route, and keyboard-walk the main flows.

## Acceptance

- Every shortcut works on `dev/`, and none fires inside an input.
- Triage the Inbox (open, archive, next, reply, send) without a mouse.
- axe reports no serious or critical issues on any route. Screen-reader smoke
  test: NVDA or VoiceOver reads the list and a conversation sensibly.

## Outcome (2026-10-20)

Built. Every shortcut in the spec is bound (plus `Shift+c` for full-screen
compose and `+`/`-` for important) through one registry in `web/src/keys/`;
none fires in a field, a menu, a dialog, with Ctrl, Alt or Meta held, or when
shortcuts are off in settings. The Inbox was triaged without a mouse (open,
archive, next, reply, send). axe-core 4.10.2 found nothing at any level on
every route in both themes once three issues were fixed (a help-sheet scroll
region, a small composer button, a duplicate banner landmark). Contrast
passes for 44 token pairs per theme; the light yellow label colour was
darkened to pass. Focus returns to the row after archive, delete, spam and
`u`. Unread rows now say "Unread" to screen readers.

Left: `j`/`k` inside a full-width conversation does nothing (no list is
mounted); the row's star button reads "Not starred" (a double negative); the
row's accessible name is long; Back by link or browser does not restore the
row's focus; search results do not take focus. The message frames were not
scanned by axe.

Owner step, by ear with NVDA or VoiceOver: the Inbox grid announces its name,
row count and position, and unread rows start with "Unread"; selecting with
`x` announces the count; an open conversation reads its subject heading and
each collapsed message's sender, address and date; archiving announces
"Conversation archived" once; the `?` sheet, the `l` and `v` menus, a hostile
message's forged-sender warning, and "Message sent." after Ctrl+Enter.
