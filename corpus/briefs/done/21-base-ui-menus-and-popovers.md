# Task 21: Base UI for the menus and popovers

## Context

This is the second half of the Base UI work. Brief 20 adds the dependency
and moves the modal dialogs, and its `decisions.md` entry covers this brief
too. **Run it after brief 20.**

The menus and popovers below are hand-built, each with its own
outside-click, Escape and arrow-key handling:

- `web/src/list/Menu.tsx`: the toolbar's select menu and "More" (a menu
  button with items).
- `web/src/composer/ComposeForm.tsx`: the "More options" menu (an inline
  `role="menu"`).
- `web/src/shell/AccountMenu.tsx`: the account card under the top bar's
  avatar (a non-modal `role="dialog"` with Sign out).
- `web/src/labels/LabelMenu.tsx`: the Labels / Move to menu, with a
  checkbox per label (some indeterminate), a search box and "Create new". It
  comes in three exports: the toolbar button + menu, the bare panel, and the
  keyboard-opened `LabelMenuPopover`.
- `web/src/search/AdvancedSearch.tsx`: the advanced-search form under the
  search box (`role="dialog"`), opened from `SearchBox.tsx`.
- `web/src/contacts/SenderHoverCard.tsx`: the card a sender's name opens on
  hover or focus, with open/close delays.

## Files you OWN

```
the six files above, SearchBox.tsx (only the advanced-search trigger),
their *.test.tsx, and the CSS rules that style them (list.css,
composer.css, shell CSS, labels.css, search CSS, contacts.css)
web/src/keys/shortcuts.ts (only if the open-overlay check needs a new selector)
corpus/wiki/status.md
```

## Files you must NOT touch

- `RecipientInput.tsx` and `SearchBox.tsx`'s suggestion list. These are the
  two comboboxes (recipient chips ranked from contacts, and search operator
  suggestions). They're specialised and well tested, so they stay hand-built.
  A move to Base UI `Combobox` would be its own brief.
- `ComposerWindow.tsx`, `web/src/render/**`, `jmap/`, `dev/`.

## What to do

1. **`web/src/list/Menu.tsx` → Base UI `Menu`.** Keep `MenuItem` and the props.
   The trigger stays the `IconButton` (via `Menu.Trigger`'s `render` prop).
2. **Compose "More options" → `Menu`.** The same pattern, inline in
   `ComposeForm.tsx`, or reuse `web/src/list/Menu.tsx` if its look fits.
3. **AccountMenu → `Popover`.** The card is `Popover.Popup` with
   `Popover.Title` holding the name. Sign out and the Stalwart link stay as
   they are.
4. **LabelMenu → `Popover`.** Keep all three exports and their props. The
   panel's contents (search box, checkbox list, Create new) stay as they
   are. Base UI provides the popup, positioning, Escape, outside press and
   focus return. `LabelMenuPopover` (opened by `l`/`v` with no button)
   anchors to the focused conversation row through the positioner's
   `anchor` prop. Keep "Labels stays open across choices, Move to closes".
5. **AdvancedSearch → `Popover`** anchored to the search box. The form,
   with its native selects, stays inside unchanged.
6. **SenderHoverCard → `PreviewCard`.** Map `OPEN_DELAY_MS`/`CLOSE_DELAY_MS`
   to the trigger's `delay`/`closeDelay`. Keep opening on keyboard focus.
   If `PreviewCard` can't open on focus, keep a small focus handler that
   sets `open`.
7. Delete each replaced outside-click, Escape and arrow-key handler. Check
   the shortcut guard in `web/src/keys/shortcuts.ts`: it already skips
   `[role='menu']` and `[role='dialog']`, but the hover card is matched by
   `.contacts-hovercard`, so keep that class on the popup or update the
   selector.
8. **Styles.** Point selectors at Base UI's attributes (`data-open`,
   `data-side`, `data-highlighted`, `data-starting-style`,
   `data-ending-style`). Keep the look the same.
9. Native checkboxes and `<select>`s inside these panels and in settings
   stay native.

## Acceptance

- `npm run check` and `npm run build` pass. `npm run test:e2e` passes
  against the local Stalwart.
- Browser check against the local Stalwart, at 1440 px and 390 px:
  - toolbar **More**: arrow keys, Escape back to the button;
  - **Labels**: tick two labels in a row and the menu stays open; an
    indeterminate label shows as such;
  - `l` on a focused row opens the label popover beside the row;
  - **Move to** closes after a choice;
  - the **account card**;
  - **advanced search** runs a search;
  - the **sender card** opens on hover after the delay and on Tab, and
    Escape closes it;
  - shortcuts don't fire while a menu is open.
  Take before/after screenshots. They should match.
- `bash corpus/lint.sh` passes.

## Outcome (2026-10-23)

Done, in `3f61d26`. On Base UI now:

- `MenuButton` (`web/src/list/Menu.tsx`, the toolbar's Select and More, and
  the message card's More) is a `Menu`, with the `IconButton` as the trigger
  through `render`;
- the composer's More options is an inline `Menu` with a `CheckboxItem`;
- `AccountMenu` is a `Popover`, with `Popover.Title` holding the name;
- `LabelMenu` and `LabelMenuPopover` are `Popover`s around the unchanged
  `LabelMenuPanel`, which keeps its search box, list and arrow keys and only
  loses its Escape branch (the create form's inner Escape stays);
- `AdvancedSearch` is a `Popover`, its trigger the Search options button. The
  form lost its own `role="dialog"`, since the popup carries it.

The CSS points at Base UI's positioners and its `data-highlighted` and
`data-disabled`. `web/src/keys/shortcuts.ts` needed no change: menus are
still `role="menu"`, and the popovers are `role="dialog"`.

What needed code:

- **Menu items that open something.** A chosen item runs from `finalFocus`,
  after focus is back on the button, so the question Plain text mode asks keeps
  focus.
- **The composer's menu.** It portals through `useLayer`, now exported from
  `shell/Modal.tsx`, into the composer window when that is full screen (modal).
  It stops Escape itself (`preventDefault` + `stopPropagation`), so neither the
  composer nor the browser's close request for its window reacts.
- **Advanced search** is portalled into the search root, so focus in the form
  still counts as in the search, and a press inside the search box leaves it
  open, as before.
- **The account card** keeps its close-when-focus-leaves handler.

Changes:

- **`LabelMenuPopover` opens under the focused row**, as this brief asked,
  where before it floated centred near the top. With no row (`l` inside a
  conversation) it keeps the old place through a virtual anchor. ShortcutsHost
  still returns focus to the row, so the popover passes `finalFocus={false}`.
- **More's longest item ("Filter messages like these") no longer wraps.** The
  old popup was sized inside a 40 px wrapper.
- **Focus now returns** to the button or the search box after Escape from the
  composer's menu and after an advanced search. Before, it dropped to
  `<body>`.

**Not moved: `SenderHoverCard`.** Base UI's PreviewCard is documented as "not
touch, keyboard or screen reader navigable", but this card holds actions (Add
to contacts, Email, Search mail from) that keyboard users reach by Tab. Moving
it would take those away. It stays hand-built, and so do the two comboboxes, as
the brief said.

Tests: three menu-item lookups wait (`findByRole`), because Base UI opens a
menu a tick after the click.

Checked: `npm run check` (1166 tests) and `npm run test:e2e` (34). In Chromium
against the dev Stalwart, at 1440 and 390 px:

- More: ↓ moves, and Escape returns to the button. `j` doesn't move the
  selection while it is open.
- Labels: two labels ticked in a row and the menu stays open; both unticked
  afterwards. Indeterminate states and Move to closing on a choice are covered
  by `LabelMenu.test`, so nothing was moved in the dev mailbox.
- `l` on a row: the popover sits under it, and Escape returns to the row.
- The account card: Escape returns to the avatar, and Tab out closes it.
- Advanced search runs `from:bob@postern.test`.
- More options works docked, and inside the full-screen composer, where it
  renders inside the modal `<dialog>`.

The before/after screenshots match apart from the two changes above. The
sender card is unchanged code. brief-board is down, so nothing was posted
there.
