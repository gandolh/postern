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
