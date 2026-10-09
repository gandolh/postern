---
summary: How Postern looks and behaves. Gmail's familiar layout (top bar with search, left navigation with Compose, conversation list, reading pane, floating composer) in Postern's own visual identity, never Google's colours, logo or wordmark; light and dark themes, three densities, reading-pane modes, phone layout, motion and accessibility targets. Read before any UI brief; impeccable works within it.
updated: 2026-10-09
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
borrow; its brand is not. Brief 05 settles the palette, type and icon set with
`impeccable`, and records them here.

## Settings the design must support

- Theme: light and dark, defaulting to the system setting.
- Density: default, comfortable, compact.
- Reading pane: none, right, below.
- Conversation view on or off (off shows single messages).

## Quality bar

- **Accessibility:** WCAG 2.2 AA contrast, keyboard-complete, visible focus,
  list and grid ARIA patterns, live-region announcements for "Conversation
  archived. Undo".
- **Motion:** short and functional (composer open, toast); none under
  `prefers-reduced-motion`.
- **Performance:** the inbox shows within a second on a warm cache, and
  scrolling 10,000 conversations stays smooth (a virtualised list).
