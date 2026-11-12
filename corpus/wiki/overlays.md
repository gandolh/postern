---
summary: How Postern's overlays and controls sit on Base UI, behind the wrappers in web/src/components/ui/ (since 2026-11-12; the overlays since 2026-10-23). Which wrapper holds what (Modal, ConfirmDialog, Menu, Popover, NavDrawer, Toast, Switch, RadioGroup, ToggleGroup), the behaviours that needed code (the layer under the native composer window, an Escape a field already used, finalFocus for items that open something, the drawer's kept label tree, the toast's one-at-a-time rule), and what stayed hand-built or native (the composer window, the two comboboxes, the sender card, the selects, the toolbars, the tooltip) and why.
updated: 2026-11-12
---

# Overlays

The call is in [decisions.md](decisions.md), "Base UI under the overlays; the
composer window stays native". `@base-ui/react` is pinned at 1.9.0; Postern
keeps its own CSS, pointed at Base UI's attributes (`data-open`,
`data-highlighted`, `data-disabled`, the positioners). The code wins where
this page and it disagree.

## The wrappers: `web/src/components/ui/`

Base UI is imported only here (the base-ui skill's rule 3; the checker looks in
`**/components/ui`). Features import a wrapper. The folder is new, and so is
`components/`: the rest of the app is one folder per feature.

| Wrapper | What it is |
|---|---|
| `Modal.tsx` | `Dialog` / `AlertDialog`, the layer logic (`layerFor`, `useLayer`), `Modal.Title`, `disablePointerDismissal` for forms |
| `ConfirmDialog.tsx` | an `AlertDialog` that takes a promise from `onConfirm` and shows `pendingLabel` while it runs |
| `Menu.tsx` | `Menu.Root`, `Trigger`, `Popup` (with Portal and Positioner), `Item`, `CheckboxItem`, `Separator`; and `MenuButton` |
| `Popover.tsx` | `Popover.Root`, `Trigger`, `Title`, `Popup` (with Portal and Positioner) |
| `NavDrawer.tsx` | Base UI's `Drawer` for the navigation below the wide breakpoint |
| `Toast.tsx` | `ToastProvider`, `useToast()`: `show({ message, action, duration })` |
| `Switch.tsx` | a `Switch` in the settings row's label |
| `RadioGroup.tsx` | a `fieldset` and legend over Base UI's `RadioGroup` |
| `ToggleGroup.tsx` | a guarded `ToggleGroup`: arrows move focus, one item stays pressed |

Their looks are Tailwind classes on the parts, in each wrapper (2026-11-12: the
Tailwind move); there are no stylesheets beside them.

## Dialogs: `Modal`

Every dialog goes through one wrapper: `ConfirmDialog` and `Question` are
`AlertDialog`s; `SessionExpiredDialog`, `ShowOriginal`, `ImageViewer`,
`HelpSheet`, `ScheduleDialog` and the snooze date dialog are `Dialog`s. The
wrapper:

- **Picks the layer.** The composer window stays a native `<dialog>`; full
  screen it is modal in the top layer and everything outside it is inert. So
  a popup goes into its own closest `dialog:modal`, else the last one open (a
  session expiring under a full-screen composer), else `<body>`
  (`layerFor`, `useLayer`). `:modal` sits in a try/catch, since jsdom doesn't
  know it.
- **Ignores an Escape a field inside already used.**
- **Gives initial focus** to `[data-autofocus]` or a selector.
- **Names the popup by its `Modal.Title`** (a `Dialog.Title` or
  `AlertDialog.Title`, by the dialog's kind). It leaves `aria-describedby` off
  when there is none, so nothing overrides what Base UI sets. The session
  dialog's title is visually hidden: the sign-in form draws its own heading.
- **Ignores a press outside on a form** (`disablePointerDismissal`):
  `ScheduleDialog` and the snooze date dialog close with Cancel or Escape.
- **Styles the layer** with utilities in `Modal.tsx`: fixed, centred,
  `z-modal` (200) over the docked composer (`z-compose`, 55) and the toasts
  (`z-popup`, 60), one backdrop.

Per dialog: `Question` keeps its own Escape handler so the composer around it
stays open; `SessionExpiredDialog` can't be dismissed (Escape and the backdrop
are ignored); `HelpSheet` stays mounted with `open` from its store, and every
way out clears its search; `ShowOriginal` and `ImageViewer` start on Close.
LabelManager's delete confirmation stays an inline box in a table cell: Base
UI has no inline alert part, and a modal would change the settings page.

`ConfirmDialog.onConfirm` may return a promise. While it runs, both buttons are
disabled, Escape and a press outside do nothing, and the confirm button says
`pendingLabel`. The caller closes the dialog; Emptying Trash or Spam
(`EmptyLabelButton`) is the one caller that returns a promise, so its dialog
stays up, saying "Emptying…", until the server answers.

## The navigation drawer: `NavDrawer`

Wide screens show the navigation inline. Narrower, the menu button opens it in
a Base UI `Drawer` from the left, under the top bar as the hand-built one was:
a swipe to the left, a press on the backdrop, Escape or the (visually hidden
until focused) close control closes it, and focus goes to Compose on open and
back to the menu button on close. Base UI makes the rest of the page inert.

The `Nav` element mounts fresh in the drawer on each opening, so what its label
tree remembers (folded parents, the hidden labels, the scroll position) lives in
`ShellLayout` (`NavMemory`, in `shell/Nav.tsx`) and the drawer puts the scroll
back as its panel takes its height. While the drawer is open the inline
navigation is not rendered, so there is one `#shell-nav`. A press on the menu
button while the drawer is up is a press outside, which closes it. Mouse
dragging does not swipe it, only touch; the e2e flow sends touch events through
the DevTools protocol.

## The toast: `Toast`

Base UI's `Toast` with `limit={1}`; `show()` closes the toast showing first, so
a new one replaces the old and the old does not come back. The default stays
8 s, `duration: null` stays until dismissed, and the timer pauses on hover and
focus (Base UI's). The viewport is a polite live region that is in the page
before the first toast; F6 moves keyboard focus into it, and Base UI keeps
the Dismiss button out of the accessibility tree until it has focus. Undo runs
its action and closes. The call sites did not change. The failure toasts
still use the 8 s default; the standing rule that an error stays until
dismissed would need a flag on each.

## Switches, radios and the invite answer

- Five settings that take effect at once are `Switch`es: conversation view,
  shortcuts, desktop notifications, the vacation responder and Web Push.
- The settings `Choice`s (theme, density, reading pane, images) apply on this
  device with nothing to send, so they are a `RadioGroup`, where the arrow keys
  choose. The role is `radiogroup`, not `group`.
- The invite answer sends a reply to the organiser on each press, so it is a
  guarded `ToggleGroup`: arrows only move focus (one tab stop), Space, Enter or
  a click answers, and the pressed one stays pressed. Its buttons keep
  `aria-pressed`.

## Menus and popovers

- The toolbar's Select and More and the message card's More (`MenuButton`)
  are `Menu`s with the `IconButton` as trigger.
- The composer's More options and the send menu's Schedule send are inline
  `Menu`s (the first with a `CheckboxItem`).
- `AccountMenu`, `LabelMenu` and `LabelMenuPopover`, `SearchBox`'s advanced
  search and `AdvancedSearch` are `Popover`s. The label panel keeps its search
  box, list and arrow keys.

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
- **Native controls** (decided 2026-11-10): the text, date and time inputs, the
  15 `<select>`s and the 17 checkboxes that are form fields or row selection.
- **The `role="toolbar"` groups**: Postern's toolbars take Tab to each button
  and the shortcuts registry owns the keys, so Base UI's `Toolbar` would change
  the keyboard order. Open for the owner.
- **The icon buttons' tooltip** stays CSS (`data-tooltip`). Open for the owner:
  Base UI `Tooltip` would be one more wrapper inside `IconButton`.
