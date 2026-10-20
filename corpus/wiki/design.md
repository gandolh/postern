---
summary: How Postern looks and behaves. Gmail's familiar layout (top bar with search, left navigation with Compose, conversation list, reading pane, floating composer) in Postern's own visual identity, never Google's colours, logo or wordmark. The chosen visual system (brief 05) - patina-on-limestone palette with light and dark hex values and contrast ratios, Atkinson Hyperlegible Next and Mono, lucide icons, the three density metrics, the mark - plus the settings it supports and the motion and accessibility targets. Read before any UI brief; impeccable works within it.
updated: 2026-10-20
---

# Design

## Familiar layout, our own face

The owner prefers familiar UI over metaphor, and asked for Gmail's features and
feel. So the layout is Gmail's, and anyone who has used Gmail knows where
everything is:

- **Top bar:** menu toggle, the Postern mark, a wide search box with an
  advanced-search dropdown, then settings, help and the account menu.
- **Left navigation:** a prominent Compose button; Inbox (with unread count),
  Starred, Sent, Drafts, Spam, Trash and All Mail; then the labels, nested and
  collapsible. It collapses to icons.
- **Main area:** the conversation list (checkbox, star, senders, subject and
  snippet, label chips, attachment icon, date) with a toolbar above it for
  selection and bulk actions. A conversation opens full-width, or in a reading
  pane to the right or below (a setting).
- **Composer:** a window docked bottom-right that can be minimised, stacked
  (several at once) and popped out to full screen.
- **Phone:** the list and the conversation stack. Swipe to archive or delete,
  and a Compose button floats bottom-right.

**The visual identity is Postern's, not Google's.** No Google colours, logo,
wordmark, Material-clone icons or product names. Gmail's arrangement is fair to
borrow; its brand is not.

## The visual system (brief 05, 2026-10-20)

Built with `impeccable` in Operate mode, on the familiar path the owner asked
for: Gmail's arrangement played straight, at the craft level of Gmail and
Fastmail. Every value lives in
[tokens.css](../../web/src/theme/tokens.css); component CSS uses tokens only.

**Palette: patina on limestone.** Restrained: warm grey-green stone neutrals
and one accent, the green of weathered copper on an old gate. Nothing in it is
a Google blue, red, yellow or green. Each colour is `light-dark(light, dark)`,
so the theme follows the system with no script. Pairs that carry text or must
be seen, as contrast ratios (AA: 4.5 text, 3 for large text and graphics):

| Pair | Light | Ratio | Dark | Ratio |
| --- | --- | --- | --- | --- |
| `text` on `surface` | #18201c / #ffffff | 16.6 | #e3e9e5 / #191f1c | 13.6 |
| `text` on `canvas` | #18201c / #f2f4f1 | 15.0 | #e3e9e5 / #111513 | 15.0 |
| `text-muted` on `surface` | #4e5853 / #ffffff | 7.4 | #aab5af / #191f1c | 7.9 |
| `text-muted` on `canvas` | #4e5853 / #f2f4f1 | 6.7 | #aab5af / #111513 | 8.7 |
| `text-subtle` on `canvas` | #5d6862 / #f2f4f1 | 5.2 | #9aa59f / #111513 | 7.2 |
| `on-accent` on `accent` | #ffffff / #1c6a57 | 6.5 | #062a20 / #72cbae | 8.0 |
| `accent` on `surface` (links) | #1c6a57 / #ffffff | 6.5 | #72cbae / #191f1c | 8.7 |
| `on-accent-soft` on `accent-soft` | #0e4537 / #d5ebe2 | 8.7 | #b4ead7 / #1d3b32 | 9.1 |
| `border-strong` on `canvas` | #7d8882 / #f2f4f1 | 3.3 | #76827b / #111513 | 4.6 |
| `focus` on `canvas` | #1c6a57 / #f2f4f1 | 5.8 | #72cbae / #111513 | 9.5 |
| `star` on `surface` (icon only) | #a86a00 / #ffffff | 4.4 | #e9b949 / #191f1c | 9.2 |
| `danger` on `surface` | #a8352b / #ffffff | 6.5 | #f2998d / #191f1c | 7.7 |
| `on-warning-soft` on `warning-soft` | #5a3b00 / #fbeed3 | 8.9 | #f6dda6 / #3a2e14 | 10.0 |
| `on-inverse` on `inverse` (toast) | #eef3f0 / #1f2924 | 13.4 | #18201c / #e3e9e5 | 13.5 |
| `inverse-accent` on `inverse` (Undo) | #8cd9bf / #1f2924 | 9.1 | #1c6a57 / #e3e9e5 | 5.2 |
| `text-muted` on `row-selected` | #4e5853 / #e3f0ea | 6.3 | #aab5af / #1f3029 | 6.6 |

The roles: `canvas` behind the navigation and top bar, `surface` for the main
panel, `surface-raised` for menus, `hover` / `active` for every quiet control,
`accent-soft` for the selected label, `row`, `row-read`, `row-hover` and
`row-selected` for brief 06's list, `inverse` for toasts and tooltips. Star is
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
ThemeProvider sets 20 px and stroke 1.75, and `.lucide` in base.css sizes them
by `--icon-size`. Icon-only controls use `IconButton` (web/src/shell), which
requires a label. System labels: Inbox, Star, Send, File (Drafts),
ShieldAlert (Spam), Trash2, Mails (All Mail); user labels: Tag.

**Densities** (`data-density` on `<html>`):

| | Row (`--row-height`) | Nav item | Toolbar |
| --- | --- | --- | --- |
| Default | 48 px (room for attachment chips) | 32 px | 48 px |
| Comfortable | 40 px | 32 px | 48 px |
| Compact | 32 px | 28 px | 40 px |

**Shape and depth.** 4 px grid. Radii 4, 8 (nav items, buttons), 12 (Compose,
search), 16 px (the main panel, menus). Navigation selection is an inset
rounded rectangle, not Gmail's half-pill. Three soft shadows; the main panel
sits flat on the canvas.

**The mark.** A rounded wall tile in the accent with a small arched gate cut
low and to one side: a postern. [favicon.svg](../../web/public/favicon.svg)
switches colours with the system scheme; the top bar draws it from the tokens.

**Layout states.** Loading shows skeleton rows at the current row height;
an empty label says "No conversations in Spam"; a lost connection shows a
banner over the main panel, and "Can't reach the mail server" with Try again
when the labels never loaded.

**Responsive.** From 1024 px the navigation is full (the menu folds it to a
rail of icons); 600 to 1023 px it is a rail and the menu opens it as a drawer
over the page; under 600 px it is hidden until the menu opens it.

## Settings the design must support

- Theme: light and dark, defaulting to the system setting.
- Density: default, comfortable, compact.
- Reading pane: none, right, below.
- Conversation view on or off (off shows single messages).

Theme, density and reading pane live in one per-device store
([displaySettings.ts](../../web/src/theme/displaySettings.ts)); brief 12
persists them.

## Quality bar

- **Accessibility:** WCAG 2.2 AA contrast, keyboard-complete, visible focus,
  list and grid ARIA patterns, live-region announcements for "Conversation
  archived. Undo". The shell scored 100 on Lighthouse accessibility, light and
  dark, wide and rail (2026-10-20).
- **Motion:** short and functional (composer open, toast); none under
  `prefers-reduced-motion`.
- **Performance:** the inbox shows within a second on a warm cache, and
  scrolling 10,000 conversations stays smooth (a virtualised list).
