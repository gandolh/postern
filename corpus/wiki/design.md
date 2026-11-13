---
summary: How Postern looks and behaves. Gmail's familiar layout (top bar with search, left navigation with Compose, conversation list, reading pane, floating composer) in Postern's own visual identity, never Google's colours, logo or wordmark. The visual system of 2026-10-20 as redesigned on 2026-11-13, "The reading desk" - a limestone canvas with the list and the reader as two islands, patina accent, light and dark hex values and the contrast table (a script measures it), Atkinson Hyperlegible Next and Mono, lucide icons, three-line rows in three densities, the phone's bottom bar - plus the settings it supports and the motion and accessibility targets. Read before any UI brief; impeccable works within it.
updated: 2026-11-13
---

# Design

## Familiar layout, our own face

The owner prefers familiar UI over metaphor, and asked for Gmail's features and
feel. So the layout is Gmail's, and anyone who has used Gmail knows where
everything is:

- **Top bar:** 56 px: menu toggle and the Postern mark (the menu toggle is gone on a
  phone), a wide search pill (44 px, up to 720 px) with an advanced-search dropdown, then
  help, settings and the account menu.
- **Left navigation:** a prominent Compose button; Inbox (with unread count),
  Starred, Snoozed, Sent, Drafts, Scheduled, Spam, Trash and All Mail; then the labels,
  nested and collapsible. It sits on the canvas, 240 px wide, and collapses to icons.
- **Main area, "The reading desk":** two islands on the canvas. The list island (440 px
  at 1280) has one 48 px head (Select all, Select, the label, the range, Refresh; the
  actions of a selection replace the label) over three-line rows. The reading pane beside
  it is on by default and shows the open conversation under a head band (the toolbar and
  the subject). A conversation opens full-width or below when the setting says so.
- **Composer:** a window docked bottom-right, 520 px tall, as wide as the pane
  (at most 560 px), that can be minimised, stacked (several at once) and popped out to
  full screen.
- **Phone:** one column. A 64 px bottom bar (Inbox, Starred, Sent, Labels) and Compose
  above it; Labels opens the drawer with the whole tree. An open conversation takes the
  whole screen, with its own toolbar in place of the top bar. Swipe to archive or delete.

**The visual identity is Postern's, not Google's.** No Google colours, logo,
wordmark, Material-clone icons or product names. Gmail's arrangement is fair to
borrow; its brand is not.

## The visual system (2026-10-20)

Built with `impeccable` in Operate mode, on the familiar path the owner asked
for: Gmail's arrangement played straight, at the craft level of Gmail and
Fastmail. Every value lives in the `@theme` of
[index.css](../../web/src/styles/index.css), the app's one stylesheet; a class
names a token (`bg-surface-raised`, `text-text-muted`) and never a raw colour.

**Palette: patina on limestone** (2026-10-20; the canvas deepened and the dark surfaces re-stepped on 2026-11-13, so the two islands stand 1.20 off the canvas in both themes). Restrained: warm grey-green stone neutrals
and one accent, the green of weathered copper on an old gate. Nothing in it is
a Google blue, red, yellow or green. Each colour is `light-dark(light, dark)`,
so `color-scheme` on `<html>` picks one (see "Theme" below). Pairs that carry text or must
be seen, as contrast ratios (AA: 4.5 text, 3 for large text, icons and UI parts):

| Pair | Min | Light | Ratio | Dark | Ratio |
| --- | --- | --- | --- | --- | --- |
| `text` on `surface` | 4.5 | #18201c / #ffffff | 16.6 | #e3e9e5 / #1d2421 | 12.9 |
| `text` on `canvas` | 4.5 | #18201c / #e8ebe7 | 13.8 | #e3e9e5 / #0d110f | 15.4 |
| `text` on `row-read` | 4.5 | #18201c / #f4f6f3 | 15.3 | #e3e9e5 / #171d1a | 13.9 |
| `text` on `row-hover` | 4.5 | #18201c / #edf1ec | 14.6 | #e3e9e5 / #232b27 | 11.8 |
| `text` on `row-selected` | 4.5 | #18201c / #d5ebe2 | 13.3 | #e3e9e5 / #1f3d33 | 9.6 |
| `text-muted` on `surface` | 4.5 | #4e5853 / #ffffff | 7.4 | #aab5af / #1d2421 | 7.5 |
| `text-muted` on `canvas` | 4.5 | #4e5853 / #e8ebe7 | 6.1 | #aab5af / #0d110f | 9.0 |
| `text-muted` on `row-read` | 4.5 | #4e5853 / #f4f6f3 | 6.8 | #aab5af / #171d1a | 8.1 |
| `text-muted` on `row-hover` | 4.5 | #4e5853 / #edf1ec | 6.5 | #aab5af / #232b27 | 6.9 |
| `text-muted` on `row-selected` | 4.5 | #4e5853 / #d5ebe2 | 5.9 | #aab5af / #1f3d33 | 5.6 |
| `text-muted` on `surface-sunken` | 4.5 | #4e5853 / #e1e5e0 | 5.8 | #aab5af / #121714 | 8.6 |
| `text-muted` on `hover` | 4.5 | #4e5853 / #dbe0db | 5.5 | #aab5af / #27302b | 6.4 |
| `text-subtle` on `surface` | 4.5 | #5d6862 / #ffffff | 5.8 | #9aa59f / #1d2421 | 6.2 |
| `text-subtle` on `canvas` | 4.5 | #5d6862 / #e8ebe7 | 4.8 | #9aa59f / #0d110f | 7.5 |
| `text-subtle` on `surface-sunken` | 4.5 | #5d6862 / #e1e5e0 | 4.6 | #9aa59f / #121714 | 7.1 |
| `accent` on `surface` | 4.5 | #1c6a57 / #ffffff | 6.5 | #72cbae / #1d2421 | 8.2 |
| `accent` on `canvas` | 4.5 | #1c6a57 / #e8ebe7 | 5.4 | #72cbae / #0d110f | 9.8 |
| `accent-hover` on `surface` | 4.5 | #155444 / #ffffff | 8.8 | #8ed8bf / #1d2421 | 9.6 |
| `on-accent` on `accent` | 4.5 | #ffffff / #1c6a57 | 6.5 | #062a20 / #72cbae | 8.0 |
| `on-accent` on `accent-hover` | 4.5 | #ffffff / #155444 | 8.8 | #062a20 / #8ed8bf | 9.4 |
| `on-accent-soft` on `accent-soft` | 4.5 | #0e4537 / #d5ebe2 | 8.7 | #b4ead7 / #1f3d33 | 8.8 |
| `on-accent-soft` on `accent-soft-hover` | 4.5 | #0e4537 / #c6e3d7 | 8.0 | #b4ead7 / #26493d | 7.5 |
| `danger` on `surface` | 4.5 | #a8352b / #ffffff | 6.5 | #f2998d / #1d2421 | 7.3 |
| `danger` on `danger-soft` | 4.5 | #a8352b / #f9e3e0 | 5.3 | #f2998d / #3b1f1b | 7.0 |
| `on-warning-soft` on `warning-soft` | 4.5 | #5a3b00 / #fbeed3 | 8.9 | #f6dda6 / #3a2e14 | 10.0 |
| `on-inverse` on `inverse` | 4.5 | #eef3f0 / #1f2924 | 13.4 | #18201c / #e3e9e5 | 13.5 |
| `inverse-accent` on `inverse` | 4.5 | #8cd9bf / #1f2924 | 9.1 | #1c6a57 / #e3e9e5 | 5.2 |
| `star` on `surface` | 3 | #a86a00 / #ffffff | 4.4 | #e9b949 / #1d2421 | 8.7 |
| `star` on `row-read` | 3 | #a86a00 / #f4f6f3 | 4.1 | #e9b949 / #171d1a | 9.4 |
| `border-strong` on `surface` | 3 | #7d8882 / #ffffff | 3.7 | #76827b / #1d2421 | 4.0 |
| `border-strong` on `canvas` | 3 | #7d8882 / #e8ebe7 | 3.1 | #76827b / #0d110f | 4.8 |
| `border-strong` on `row-read` | 3 | #7d8882 / #f4f6f3 | 3.4 | #76827b / #171d1a | 4.3 |
| `focus` on `surface` | 3 | #1c6a57 / #ffffff | 6.5 | #72cbae / #1d2421 | 8.2 |
| `focus` on `canvas` | 3 | #1c6a57 / #e8ebe7 | 5.4 | #72cbae / #0d110f | 9.8 |
| `focus` on `row-selected` | 3 | #1c6a57 / #d5ebe2 | 5.2 | #72cbae / #1f3d33 | 6.1 |
| `accent` on `row-read` | 3 | #1c6a57 / #f4f6f3 | 5.9 | #72cbae / #171d1a | 8.9 |

`node scripts/contrast.mjs` measures every pair over the `@theme` block of `index.css`, in both themes, and fails under the minimum (`npm run contrast`; `npm run check` runs it). The island edge (`border` on `canvas`) is 1.64 in light and 1.61 in dark: it is a quiet edge, not a control, and the 3:1 parts (`border-strong`, `focus`) are in the table.

The roles: `canvas` behind the navigation and top bar, `surface` for the main
panel, `surface-raised` for menus, `hover` / `active` for every quiet control,
`accent-soft` for the selected label, `row`, `row-read`, `row-hover` and
`row-selected` for the conversation list, `inverse` for toasts and tooltips. Star is
brass and is for the icon; never set text in it (4.4 in light).

**Type: Atkinson Hyperlegible Next and Mono**, self-hosted from
`@fontsource-variable/atkinson-hyperlegible-next` and
`@fontsource/atkinson-hyperlegible-mono` (5.3.0, OFL). Next is the whole UI: its
l, I and 1 and its 0 and O differ, which is what spotting a lookalike sender
address needs. Mono sets keys, raw headers and message source. A fixed rem
scale: 12, 13, 14 (the UI and list rows), 16 (bodies, inputs), 20 (wordmark,
panel titles), 24 px; weights 400, 500, 600, 700. Unread is bold, as in Gmail.

**Icons: lucide-react 1.52.0** (ISC), bundled at build time, no icon font.
Import each by name (`import { Archive } from "lucide-react"`); the
ThemeProvider sets 20 px and stroke 1.75, and `.lucide` in the base layer of
index.css sizes them by `--icon-size`. Icon-only controls use `IconButton` (web/src/shell), which
requires a label. System labels: Inbox, Star, Send, File (Drafts),
ShieldAlert (Spam), Trash2, Mails (All Mail); user labels: Tag.

**Densities** (`data-density` on `<html>`). A row has three lines (senders and date; chips and subject; snippet), so
`--row-height` is a floor: 2026-11-13, it replaces the old one-line rows of 48, 40 and 32 px.

| | Row (`--row-height`) | Nav item | Head |
| --- | --- | --- | --- |
| Default | 72 px, 6 px padding | 36 px | 48 px |
| Comfortable | 64 px, 4 px padding, a 12/16 snippet | 32 px | 48 px |
| Compact | 52 px, no snippet | 28 px | 40 px |

A subject wraps before it is cut, so a row can be taller than its floor and the virtual list measures every row
(`useVirtualRows`). On a phone the row has no height floor. Type is a fixed ladder with a line height per
size: 12/16, 13/18, 14/20, 16/24, 20/28, 24/32.

**Shape and depth.** 4 px grid. Radii 4, 8 (nav items, buttons), 12 (Compose,
search), 16 px (the main panel, menus). Navigation selection is an inset
rounded rectangle, not Gmail's half-pill. Three soft shadows; the two islands (radius 16) carry a hairline `border` and the smallest shadow, and in dark the
border does the shadow's work.

**The mark.** A rounded wall tile in the accent with a small arched gate cut
low and to one side: a postern. [favicon.svg](../../web/public/favicon.svg)
switches colours with the system scheme; the top bar draws it from the tokens.

**Layout states.** Loading shows still skeleton rows (three bars each, nothing pulses) at the current row height;
an empty label says "No conversations in Spam"; a lost connection shows a
banner over the main panel, and "Can't reach the mail server" with Try again
when the labels never loaded.

**Responsive.** From 1024 px the navigation is full (the menu folds it to a rail of icons); 600 to 1023 px it is a
rail and the menu opens it as a drawer over the page; under 600 px (2026-11-13, it was "hidden until the menu opens it")
a 64 px bottom bar holds Inbox, Starred, Sent and Labels, Labels opens the drawer with the whole tree, and the top bar has
no menu button. The bars sit at the foot at 768x1024 too (`min-height: 100dvh`). The reading pane stays off on phones.

## Settings the design must support

- Theme: Light, Dark or System, **light on a first visit** (2026-11-12, the owner's call of 2026-11-10). `data-theme` on `<html>` is `light`, `dark` or `system`; `color-scheme` follows it in index.css (`system` follows the operating system live); a small external script, `web/public/theme-boot.js`, puts a kept choice on the page before the first paint.
- Density: default, comfortable, compact.
- Reading pane: none, right, below; **right by default** (2026-11-13, it was none). A stored choice wins, and a phone is one column whatever it says.
- Conversation view on or off (off shows single messages).

Theme, density and reading pane live in one per-device store
([displaySettings.ts](../../web/src/theme/displaySettings.ts)), kept in
localStorage. Conversation view is a per-account pref in
[prefs.ts](../../web/src/prefs/prefs.ts) (2026-10-27); with it off a row is one
message, and opening it opens the whole conversation at that message.

## Quality bar

- **Accessibility:** WCAG 2.2 AA contrast, keyboard-complete, visible focus,
  list and grid ARIA patterns, live-region announcements for "Conversation
  archived. Undo". The shell scored 100 on Lighthouse accessibility, light and
  dark, wide and rail (2026-10-20).
- **Motion:** short and functional (composer open, toast); none under
  `prefers-reduced-motion`.
- **Performance:** the inbox shows within a second on a warm cache, and
  scrolling 10,000 conversations stays smooth (a virtualised list).
