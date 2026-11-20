# Postern, the reading desk: tokens map

`postern.tokens.css` is a drop-in for `web/src/styles/index.css`: the `@theme static` block replaces the file's own, and the `:root` block after it updates the layout variables in `@layer base`. The app resolves light and dark with `light-dark()` pairs and `color-scheme` on `<html>`, so there is no separate `[data-theme="dark"]` block. The board used the app's token names throughout, so no role is renamed.

## Renamed or remapped (board role, app token)

Names stay; these values change (light, dark):

- `--color-canvas` `#e8ebe7`, `#0d110f` (was `#f2f4f1`, `#111513`): a deeper ground so two islands stand off it, 1.20 in both themes.
- `--color-surface` dark `#1d2421` (was `#191f1c`); `--color-surface-raised` dark `#262e2a` (was `#212825`); `--color-surface-sunken` `#e1e5e0`, `#121714` (was `#ebeeea`, `#151a17`).
- `--color-hover` `#dbe0db`, `#27302b`; `--color-active` `#cfd6d0`, `#313c36`: stronger, so hover reads on the new canvas.
- `--color-border` `#c4ccc6`, `#3b4641` (was `#d3d9d4`, `#323b36`): the island edge is 1.64 on white and 1.61 in dark.
- `--color-accent-soft` dark `#1f3d33`; `--color-accent-soft-hover` dark `#26493d`.
- `--color-row-read` `#f4f6f3`, `#171d1a`; `--color-row-hover` `#edf1ec`, `#232b27`.
- `--color-row-selected` `#d5ebe2`, `#1f3d33` (was `#e3f0ea`, `#1f3029`): now the same value as `accent-soft`, so the open row and the navigation's selected label match. The code may alias it: `--color-row-selected: var(--color-accent-soft)`.
- Board names to app names where the sketch used its own: `soft` is `accent-soft`, `onsoft` is `on-accent-soft`, `rowread` is `row-read`, `raised` is `surface-raised`, `sunken` is `surface-sunken`, `strong` is `border-strong`, `muted` is `text-muted`, `subtle` is `text-subtle`; `--radius-island` is `--radius-xl`, `--radius-control` is `--radius-lg`, nav items and chips are `--radius-md`, `--shadow-fab` is `--shadow-lg`, `--bar` is `--topbar-height`.
- Unchanged values (21, scrim included): text, text-muted, text-subtle, border-strong, accent, accent-hover, on-accent, on-accent-soft, focus, selection, star, danger, danger-soft, warning-soft, on-warning-soft, inverse, on-inverse, inverse-accent, skeleton, skeleton-shine, scrim; also the radii, shadows, fonts, z-index and motion.
- Layout variables: `--nav-width` `16rem` to `15rem`; `--row-height` `3rem` to `4.5rem` (72 px with 6 px padding; comfortable `4rem`, 4 px padding and a 12/16 snippet; compact `3.25rem`); `--topbar-height` `4rem` to `3.5rem` (56 px, a 44 px search pill); `--nav-item-height` `2rem` to `2.25rem`. A subject that wraps to two lines makes its row taller than `--row-height`, so the virtual list measures rows instead of assuming one height.
- Headings: the base rule sets `h1, h2, h3` to weight 600; the list head and the conversation's subject are 700 on the board.

## New tokens (and the component that needs them)

- `--text-xs--line-height` 1rem, `--text-sm--line-height` 1.125rem, `--text-md--line-height` 1.25rem, `--text-lg--line-height` 1.5rem, `--text-xl--line-height` 1.75rem, `--text-2xl--line-height` 2rem: every size now carries its own line height (12/16, 13/18, 14/20, 16/24, 20/28, 24/32); the three-line row and the message body need them.
- `--lhead-height` 3rem: the merged list head (Select all, Select, label, range, Refresh), 48 px at both widths.
- `--list-width` 27.5rem: the list island at 1280, 440 px (the reading pane takes the rest).
- `--bottombar-height` 4rem: the phone bottom bar (Inbox, Starred, Sent, Labels); the list's end padding is this plus Compose (3.5rem) plus two 1rem gaps plus the gesture inset.
- No new colour token. The unread dot uses `--color-accent`; the reader's head band uses `--color-row-read`; the pane's top rule uses `--color-row-selected`.

## App tokens the design no longer uses (keep or drop is the code brief's call)

- `--color-skeleton-shine` and `--animate-skeleton` with its `skeleton-shine` keyframes: the board draws the loading rows still, as research prefers (open sticky).
- `--color-warning-soft` and `--color-on-warning-soft`: no warning band on the three screens (other screens may use them).
- `--leading-tight` and `--leading-normal`: the per-size line heights replace them in rows and messages; headings may keep `--leading-tight`.
- `--nav-rail-width`: the rail layout is not drawn on the board; it stays for the middle width.
- `--row-padding-inline`: the three-line row pads 4 px on the left and 8 px on the right by its own rule.
