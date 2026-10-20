# Task 05: The app shell (Gmail's layout, Postern's face)

## Context

[design.md](../../wiki/design.md) fixes the layout as Gmail's (top bar,
navigation with Compose, main area) and the identity as Postern's. This brief
builds the frame every later screen sits in, and settles the visual system with
`impeccable`. The owner prefers familiar UI over metaphor. Words come from
[glossary.md](../../wiki/glossary.md): label, not folder.

## Files you OWN

- `web/src/shell/**`: top bar, navigation, main area, account menu, routing
- `web/src/theme/**`: design tokens (colour, type, spacing, radius, shadow) for
  light and dark, plus three densities
- `web/src/labels/useLabels.ts`: the label list with unread counts, from
  `@postern/jmap`
- `web/public/`: the Postern mark and favicon (original artwork, not Google's)
- `corpus/wiki/design.md`: record the chosen palette, type and icon set

## What to do

1. **Routes** under `/webmail/`:
   - `#inbox`, `#starred`, `#sent`, `#drafts`, `#spam`, `#trash`, `#all`;
   - `#label/<id>`, `#search/<query>`, `#<label>/<conversationId>`;
   - `#settings/<section>`.

   Back and forward work as in Gmail.
2. **Navigation.**
   - The Compose button (it opens nothing until brief 08).
   - System labels, by JMAP role, with unread counts on Inbox, Drafts and
     Spam.
   - User labels, nested by `parentId`, collapsible, "More" for the hidden
     ones.
   - Collapses to icons on narrow screens.
3. **Top bar.**
   - Menu toggle and the mark.
   - The search box (a shell only; brief 10 wires it).
   - Settings, help (brief 14's sheet) and the account menu (name, address,
     sign out).
4. **Visual system.** Run `impeccable` within design.md's constraints. Pick:
   - an original palette for light and dark, passing AA;
   - a type pair, self-hosted;
   - an open-source icon set (self-hosted, no CDN);
   - the three densities.

   No Google colours, logo, wordmark or Material clones.
5. **States:** loading skeletons, empty labels ("No conversations in Spam"),
   connection lost.

## Acceptance

- Signed in as alice on `dev/`, the shell shows her labels with correct unread
  counts, and every route renders its placeholder.
- Light and dark follow the system setting and switch live. Densities change
  row height.
- Keyboard-reachable and screen-reader-labelled. Lighthouse accessibility 95+
  on the shell.
- design.md records the tokens and icon set; nothing on screen is Google
  branding.

## Outcome (2026-10-20)

Built. The palette is stone neutrals with one weathered-copper green accent,
the type is Atkinson Hyperlegible Next (its l, I and 1 differ, which helps
spot look-alike addresses) with its Mono, and the icons are lucide. All are
self-hosted and recorded in [design.md](../../wiki/design.md). Lighthouse
accessibility scored 100 on the signed-in shell in both themes.

So that later briefs never edit the shell, the shell renders placeholder
components at the paths those briefs own (`list/ListRoute.tsx`,
`conversation/ConversationView.tsx`, `search/*`, `settings/SettingsRoutes.tsx`,
`contacts/ContactsRoute.tsx`, `composer/`, `keys/`, `live/LiveHost.tsx`,
`labels/LabelMenu.tsx`), and exports the router, a single toast and the
labels store. Beyond the spec: display settings include the reading pane
(the shell lays out the split), and the search box already navigates to
`#search/<query>`. "No conversations in Spam" is checked in jsdom only,
because the seed has no empty label.
