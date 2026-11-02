---
summary: How Postern's dialogs, menus and popovers sit on Base UI since 2026-10-23. The Modal wrapper (layer picking under the native composer window, Escape a field already used, initial focus, the backdrop), what each dialog and menu became, the behaviours that needed code (finalFocus for items that open something, the composer menu's Escape, advanced search portalled into the search root), and what stayed hand-built (the composer window, the two comboboxes, the sender card) and why.
updated: 2026-11-02
---

# Overlays

The call is in [decisions.md](decisions.md), "Base UI under the overlays; the
composer window stays native". `@base-ui/react` is pinned at 1.9.0; Postern
keeps its own CSS, pointed at Base UI's attributes (`data-open`,
`data-highlighted`, `data-disabled`, the positioners). The code wins where
this page and it disagree.

## Dialogs: `web/src/shell/Modal.tsx`

Six of the seven dialogs go through one wrapper: `ConfirmDialog` and
`Question` are `AlertDialog`s; `SessionExpiredDialog`, `ShowOriginal`,
`ImageViewer` and `HelpSheet` are `Dialog`s. The wrapper:

- **Picks the layer.** The composer window stays a native `<dialog>`; full
  screen it is modal in the top layer and everything outside it is inert. So
  a popup goes into its own closest `dialog:modal`, else the last one open (a
  session expiring under a full-screen composer), else `<body>`
  (`layerFor`, `useLayer`). `:modal` sits in a try/catch, since jsdom doesn't
  know it.
- **Ignores an Escape a field inside already used.**
- **Gives initial focus** to `[data-autofocus]` or a selector.
- **Styles the layer** in `shell/modal.css`: fixed, centred, `z-index: 200`
  over the docked composer (55) and the toasts (60), one `.modal-backdrop`.

Per dialog: `Question` keeps its own Escape handler so the composer around it
stays open; `SessionExpiredDialog` can't be dismissed (Escape and the backdrop
are ignored); `HelpSheet` stays mounted with `open` from its store, and every
way out clears its search; `ShowOriginal` and `ImageViewer` start on Close.
LabelManager's delete confirmation stays an inline box in a table cell: Base
UI has no inline alert part, and a modal would change the settings page.

## Menus and popovers

- The toolbar's Select and More and the message card's More (`MenuButton`,
  `web/src/list/Menu.tsx`) are `Menu`s with the `IconButton` as trigger.
- The composer's More options is an inline `Menu` with a `CheckboxItem`.
- `AccountMenu`, `LabelMenu` and `LabelMenuPopover`, and `AdvancedSearch`
  are `Popover`s. The label panel keeps its search box, list and arrow keys.

What needed code:

- **An item that opens something** runs from `finalFocus`, after focus is
  back on the button, so the question Plain text mode asks keeps focus.
- **The composer's menu** portals through `useLayer` into the composer window
  when that is full screen, and stops Escape itself, so neither the composer
  nor the browser's close request reacts.
- **Advanced search** is portalled into the search root, so focus in the form
  still counts as in the search.
- **`LabelMenuPopover`** opens under the focused row (`l`, `v`); with no row
  it keeps the old place through a virtual anchor, and passes
  `finalFocus={false}` because ShortcutsHost returns focus to the row.
- The account card keeps its close-when-focus-leaves handler.

The shortcut guard in `web/src/keys/shortcuts.ts` needed no change: menus are
still `role="menu"` and popovers `role="dialog"`. Tests that look up a menu
item wait (`findByRole`), because Base UI opens a menu a tick after the click.

## Stayed hand-built

- **The composer window**, a native `<dialog>`.
- **The two comboboxes**, `RecipientInput` and the search box's operator
  suggestions: specialised and well tested; a move to Base UI `Combobox`
  would be its own brief.
- **`SenderHoverCard`**: Base UI's PreviewCard is documented as not keyboard
  or screen-reader navigable, and this card holds actions (Add to contacts,
  Email, Search mail from) that keyboard users reach by Tab.
