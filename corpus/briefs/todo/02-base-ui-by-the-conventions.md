# Task 02: Base UI by the conventions

**Depends on:**

- In Postern: brief 01, for the gate, the formatter and `.claude/rules/web.md`.
- In the owner's skills library:
  - brief 02, *A base-ui skill, styled with Tailwind*: rules 1-13, the references and `check-base-ui.mjs`;
  - brief 15, *Enforce the base-ui and code-structure skills in every repo*: the checker runs `--warn-only` until brief 03 here is done.
- The owner's grilling of 2026-11-10: Q15 and Q59 (Base UI only under `ui/`, where wrappers live), Q16 (where native controls stay), Q40 (the phone navigation `Drawer`), Q41 and Q57 (filters and pickers), Q58 (form dialogs), Q60 and Q62 (tests), and the questions still open in the decisions below.

**Runs before:** 03. This brief changes structure and behaviour. Brief 03 then changes only the styling, so its before and after screenshots compare like with like.

**Before you start:** run `brief-board guide` ([corpus/CLAUDE.md](../../CLAUDE.md)).

## Context

The owner's call of 2026-11-09 is Base UI everywhere at 1.9.0, with the base-ui skill's conventions enforced in each repo. Postern moved its overlays onto Base UI on 2026-10-23 ([wiki/decisions.md](../../wiki/decisions.md), "Base UI under the overlays; the composer window stays native", and [wiki/overlays.md](../../wiki/overlays.md)). That decision keeps three things hand-built or native, and this brief keeps them too: the composer window (`web/src/composer/ComposerWindow.tsx:76`, a native `<dialog>`), the two comboboxes (`web/src/composer/RecipientInput.tsx:184`, `web/src/search/SearchBox.tsx:157`) and the sender card (`web/src/contacts/SenderHoverCard.tsx`).

### The pin (verified 2026-11-09)

- `web/package.json` pins `"@base-ui/react": "1.9.0"` exactly. No other `package.json` declares it.
- `package-lock.json:1627-1628` resolves `node_modules/@base-ui/react` at 1.9.0.
- `grep -rn "OTPFieldPreview\|otp-field\|sanitizeValue" --include=*.ts --include=*.tsx .` finds nothing.

**No bump brief is needed.**

### The audit against rules 1-13 (2026-11-09)

Every count below comes from `grep -rn "@base-ui/react" web/src --include=*.ts --include=*.tsx` and the greps named in the rows. No test imports or mocks `@base-ui/react`.

| Rule | Violations | Where |
|---|---|---|
| 1. Exact pin | 0 | |
| 2. Subpath imports | 0 | All 8 imports are subpaths: `alert-dialog`, `dialog`, `menu` ×3, `popover` ×3. |
| 3. Base UI only under a `ui/` folder | **7 files** | `web/src/shell/Modal.tsx:11-12` (the Dialog and AlertDialog wrapper), `web/src/list/Menu.tsx:6` (a Menu wrapper), `web/src/composer/ComposeForm.tsx:11` (two Menus built inline, lines 258-292 and 303-340), `web/src/snooze/SnoozeMenu.tsx:7` (a Menu inline), `web/src/labels/LabelMenu.tsx:20` (two Popovers inline, lines 68-84 and 114-132), `web/src/search/SearchBox.tsx:9` (a Popover inline, 188-230), `web/src/shell/AccountMenu.tsx:5` (a Popover inline). There is no `web/src/components/` folder. |
| 4. Tailwind on the parts, no class selector aimed at a part | all the Base UI styling | `web/src/shell/modal.css`, and per-feature rules for `.list-menu-positioner`, `.labels-popup`, `.shell-account-positioner`, `.compose-menu-positioner`, `.search-advanced-positioner`. **Brief 03's work.** |
| 5-7. One stylesheet, semantic tokens, motion | all of them | **Brief 03's work.** Eight inline `style` props: seven compute geometry or a width from data (`web/src/shell/states.tsx:57, 72`, `web/src/settings/QuotaBar.tsx:64`, `web/src/list/ConversationList.tsx:547-548`, `web/src/list/Row.tsx:295`, `web/src/conversation/MessageFrame.tsx:63`) and two set a `--depth` variable (`web/src/labels/LabelManager.tsx:153`, `web/src/shell/Nav.tsx:232`). All are the "computed geometry" rule 5 allows, so no exception is needed. |
| 8. Floating parts portalled, z from tokens | 1 | Every Base UI popup goes through its `Portal` (`Modal.tsx`, `ComposeForm.tsx:261, 304`, `SnoozeMenu.tsx:45`, `SearchBox.tsx:224`, `LabelMenu.tsx:72, 114`, `AccountMenu.tsx:38`, `web/src/list/Menu.tsx:35`). The toast is not portalled (`web/src/shell/toast.tsx:73`, rule 13's first row). Z-indexes are raw numbers, not tokens: 27 declarations, 1 to 200 (`grep -rn "z-index" web/src --include=*.css`). **Token scale is brief 03's work.** |
| 9. A trigger around a component uses `render` | 0 | The component-wrapping triggers all use `render`: `ComposeForm.tsx:303`, `SnoozeMenu.tsx:44`, `LabelMenu.tsx:68-71`, `web/src/list/Menu.tsx:34`. The three that don't wrap a component are plain buttons: `ComposeForm.tsx:258`, `SearchBox.tsx:188`, `AccountMenu.tsx:29`. |
| 10. `Select.Root` with `items` | 0 | No Base UI `Select`. The 15 `<select>`s are native (see rule 13). |
| 11. No `window.confirm`, `alert` or `prompt` | 0 | a grep of `web/src` for `window.confirm`, `window.alert`, `window.prompt` and bare calls to them finds nothing outside tests. |
| 12. Dialogs | **10** | See below. |
| 13. Base UI over hand-built widgets | **6 rows** | See below. |

**Rule 12's ten.** `Modal` (`web/src/shell/Modal.tsx`) already passes the structure: controlled `open` and `onOpenChange` (line 78), the Escape guard (line 81, `details.reason === "escape-key" && details.event.defaultPrevented`), `initialFocus` as `[data-autofocus]` else Base UI's first tabbable (line 96), and `disablePointerDismissal` for the undismissable case (line 109). What fails:

- **No `Title` part on any dialog (8 sites).** Every caller labels the popup with an `<h2 id>` and `labelledBy`, or with `label=` and no visible title: `web/src/composer/Question.tsx:23`, `web/src/composer/ScheduleDialog.tsx:60`, `web/src/snooze/SnoozeMenu.tsx:136`, `web/src/list/ConfirmDialog.tsx:17`, `web/src/conversation/ShowOriginal.tsx:43`, `web/src/keys/HelpSheet.tsx:31` (all `labelledBy`), and `web/src/auth/SessionExpiredDialog.tsx:23` and `web/src/attachments/ImageViewer.tsx:45` (`label=`). `ConfirmDialog` has eight call sites on top of that, all through the one wrapper.
- **No `disablePointerDismissal` on a form people type into (2 sites; decision 8).** `ScheduleDialog.tsx:60` (inputs at 117 and 132) and `SnoozeMenu.tsx:136` (inputs at 153 and 167): a stray press outside discards what was typed.
- The confirm pattern's **pending state** is absent: `web/src/list/ConfirmDialog.tsx:28` calls `onConfirm` and does nothing while it runs. This is rule 12's neighbour, the skill's confirm pattern, and is counted in step 6.

**Rule 13's six**, with what Postern's decisions keep native left out:

1. **The toast**, `web/src/shell/toast.tsx`: a hand-built one-at-a-time snackbar with a store, a timer that pauses on hover and focus, an Undo action and a polite live region (line 73). It has 13 `useToast()` calls in 12 files. It becomes Base UI `Toast`, with `Toast.createToastManager()` if a call has to reach it from outside React.
2. **The navigation drawer**, `web/src/shell/Shell.tsx:71-105`: below the wide breakpoint, the `Nav` opens as a drawer with a hand-built scrim (`shell-scrim`, line 104), its own Escape handler and focus move (83-95) and `inert` on the main column (105). It is a modal panel, so it becomes a Base UI `Drawer`, closed by a swipe too. See decision 3.
3. **Five settings switches** that are checkboxes: `web/src/settings/GeneralSettings.tsx:29` (conversation view), `:43` (shortcuts), `:79` (desktop notifications), `web/src/settings/VacationForm.tsx:124` (responder on) and `web/src/push/WebPushToggle.tsx:47` (Web Push). Each is one setting that takes effect at once, which is a `Switch`.
4. **The radio sets**, `web/src/settings/GeneralSettings.tsx:128-140` (`Choice`, a `<fieldset>` of native radios, used three times at lines 25-27 and once more for the undo-send choice): becomes `RadioGroup` + `Radio`.
5. **The invite answer**, `web/src/invites/InviteCard.tsx:202-207`: a `role="group"` of `aria-pressed` buttons, one chosen at a time. Becomes a guarded `ToggleGroup` + `Toggle` (decision 9).
6. **The icon button's tooltip**, `web/src/shell/IconButton.tsx:10-30`: a CSS `data-tooltip` pseudo-element (`web/src/theme/base.css:229-272`, `web/src/composer/composer.css:514, 667`), used by 44 `<IconButton` calls in 15 files. See decision 4.

**Considered and left:**

- **Kept by [wiki/decisions.md](../../wiki/decisions.md):**
  - the composer `<dialog>` and the two comboboxes and the sender card;
  - `LabelManager`'s delete confirmation, an inline `role="alertdialog"` box in a table cell (`web/src/labels/LabelManager.tsx:196`).
- **Native, Q16's default** (decision 5): the 15 `<select>`s (`web/src/composer/ComposeForm.tsx:203`, `web/src/search/AdvancedSearch.tsx:98, 103, 111, 121`, `web/src/labels/LabelManager.tsx:180, 283, 336`, `web/src/labels/LabelMenu.tsx:363`, `web/src/filters/FilterEditor.tsx:178, 190, 221`, `web/src/settings/GeneralSettings.tsx:61`, `web/src/settings/AccountsSettings.tsx:54`, `web/src/mobile/SwipeSettings.tsx:22`), the text inputs, and the 17 checkboxes that are form fields or row selection rather than settings (`FilterEditor.tsx` ×10, `AdvancedSearch.tsx:139`, `SignInForm.tsx:196`, `LabelManager.tsx:162, 173`, `LabelMenu.tsx:303`, `web/src/list/Toolbar.tsx:99`, `web/src/list/Row.tsx:182`).
- **Not widgets:** the four `role="toolbar"` groups (`web/src/composer/editor/Editor.tsx:450`, `web/src/conversation/ConversationView.tsx:148`, `web/src/list/Toolbar.tsx:94`, `web/src/send/ScheduledRoute.tsx:148`). Base UI 1.9.0 has a `Toolbar` with a single Tab stop and arrow keys; Postern's toolbars take Tab to each button and the shortcuts registry owns the keys ([wiki/keyboard-and-accessibility.md](../../wiki/keyboard-and-accessibility.md)), so switching would change keyboard order. Left; decision 6.
- **Toggle buttons** with `aria-pressed` that stand alone (`web/src/list/Row.tsx:197, 206`, `web/src/conversation/MessageCard.tsx:208`, `web/src/composer/ComposeForm.tsx:297`): left as buttons. They sit in a virtualised grid row, and a Base UI `Toggle` adds nothing a `<button aria-pressed>` lacks.
- **`web/src/shell/status.tsx`'s `createPortal`**: a slot in the top bar, not a floating part.

**Styling classes used as behaviour hooks** (brief 03 renames classes, so these must move to refs or `data-` attributes first):

- `web/src/keys/ShortcutsHost.tsx:49`, `target.closest(".conv-page")`;
- `web/src/mobile/useListGestures.tsx:106`, `querySelector(".mobile-swipe-label")`;
- `web/src/keys/shortcuts.ts:133`, `closest("[data-compose-key], [role='menu'], …")` (roles and attributes, so safe);
- tests and e2e that select by class: `web/src/auth/SessionProvider.test.tsx:268` (`.modal-backdrop`), `web/src/conversation/ConversationView.test.tsx` (5), `web/src/filters/FiltersSettings.test.tsx`, `web/src/search/search.test.tsx`, `web/src/mobile/useListGestures.test.tsx`, and 51 in `web/e2e/` (`hostile.spec.ts` 24, `csp.spec.ts` 9, `conversation-view-off.spec.ts` 6, `reload.spec.ts` 5, `tokens.spec.ts` 4, `web/e2e/lib/app.ts` 2, `dns.spec.ts` 1). Brief 03 owns the tests' side. This brief only fixes the two non-test hooks, because they would break at runtime.

## Owner decisions

Decided on 2026-11-10 (the owner's grilling; the technical calls are marked, and the owner may overrule them). An item no answer covers stays a default.

1. **Base UI only under `ui/`** (Q15 and Q59, decided 2026-11-10, technical call). Postern's 7 files that import Base UI, listed above, move behind wrappers in `web/src/components/ui/`. The folder is new, and so is the `components/` folder it sits in (Postern keeps one folder per feature). **Wrappers stay in `components/ui/` even though the rest of the app is in feature folders** (Q59), which is also where the checker looks. `web/src/shell/ui/` is rejected.
2. **The wrappers keep their call shape.** Default: `Modal`, `ConfirmDialog` and `IconButton` keep their props, so none of their 25 call sites changes except to add a `Title`, and `layerFor`/`useLayer` (the composer-window portal logic in `Modal.tsx:16-48`) move with `Modal` unchanged. The behaviours [wiki/overlays.md](../../wiki/overlays.md) records stay exactly as they are.
3. **The navigation drawer: Base UI's `Drawer`** (Q40, decided 2026-11-10, owner: phone navigation panels move to the swipeable `Drawer`, closed by a swipe as well as a tap outside, the X or Esc). When `mode === "drawer"`, `Shell` renders `Nav` inside a Base UI `Drawer` popup anchored to the left, closed by a swipe to the left (`swipeDirection`, checked against 1.9.0's types), a tap on the backdrop, the close control or Esc, with `finalFocus` on the `[aria-controls="shell-nav"]` button; `rail` and `expanded` stay inline. That deletes the scrim, the Escape effect and the `inert` attribute (`Shell.tsx:83-95, 104-105`). `Nav`'s 21 `[data-nav` CSS selectors (`web/src/shell/shell.css`) are brief 03's. The swipe is on the open panel only: no `SwipeArea`, so the drawer does not open from an edge swipe and does not compete with the list's swipe gestures (`web/src/mobile/useListGestures.tsx`). If a spike shows the one-`Nav`-element design cannot be portalled without losing its state (the open label tree, scroll), stop and report; the fallback is to record the drawer as an exception in `scripts/conventions.json` with that reason.
4. **The icon buttons' tooltip.** Default: it stays CSS-only in this brief and brief 03 ports the pseudo-element. The alternative is Base UI `Tooltip` in `IconButton`: 44 call sites get a portalled popup with a delay, touch screens still have no hover, and the composer window's top layer (`useLayer`) would need the tooltip too. If the owner chooses `Tooltip`, it is one more wrapper and `IconButton.tsx` changes; no call site does. *Still open for the owner.*
5. **Native controls** (Q16, decided 2026-11-10, technical call). Native text, date and time inputs, and a native `<select>` on phones, stay native: the list under "Considered and left" stays native, and the Base UI decision gains a line saying so. Postern's decision records only the composer window, the two comboboxes and the sender card; it is silent on selects and checkboxes, so this is a new line in it, not a reading of an old one.
6. **The `role="toolbar"` groups.** Default: left (above). *Still open for the owner.*
7. **The pending confirm.** Default: `ConfirmDialog.onConfirm` may return a promise, and while it runs both buttons are disabled, Esc and a press outside do nothing, and the confirm label becomes `pendingLabel` ("Working…" is the skill's text; use [wiki/glossary.md](../../wiki/glossary.md)'s words if the call sites name an action). Every current `onConfirm` returns void and closes at once, so nothing changes for them; the first caller that returns a promise is `web/src/filters/EmptyLabelButton.tsx:64`, which calls `void run(plan)`.
8. **Form dialogs stay open on an outside tap** (Q58, decided 2026-11-10, owner). A dialog that holds a form sets `disablePointerDismissal`; it closes with Cancel, the X or Esc. Here that is `ScheduleDialog` and the snooze custom-date dialog (step 4). **Inline confirms stay inline** (Q58): `LabelManager`'s in-cell delete confirmation is kept as it is, and nothing moves to `AlertDialog` for the sake of it. `ConfirmDialog` is already a dialog and stays one.
9. **The invite answer, and the settings choices** (Q41 and Q57, decided 2026-11-10, technical call, applied by what each control does). A control that **saves** on each choice is a guarded `ToggleGroup`: arrow keys move focus without saving, and one item stays pressed once chosen. The invite answer (`InviteCard.tsx:202-207`) sends a reply to the organiser on each press, so it is a guarded `ToggleGroup`: arrows never send a reply. The settings `Choice` radios (theme, density, reading pane, images) apply locally and are kept in this browser, with nothing to send, so they stay a `RadioGroup`, where arrow keys may choose, as native radios do today.
10. **Tests** (Q60 and Q62, decided 2026-11-10, technical call). jsdom tests only for wrappers that hold logic: `Modal` (the Escape guard, `initialFocus`, `disablePointerDismissal`, the composer-window portal), `ConfirmDialog` (pending) and `Toast` (one at a time, Undo, the pausing timer). `Switch`, `RadioGroup`, `ToggleGroup`, `Menu` and `Popover` wrap Base UI with no logic of their own: no unit test, and the drawer's open, focus, Esc and swipe, the switches and the menus are Playwright flows in `web/e2e/`. Tests **select by role**, and `data-testid` only where no role fits.
11. **Parity** (Q19, decided 2026-11-10, owner: close enough). The before and after screenshots at 1280 and 390 px show no visible change to layout or colour, apart from what this brief changes on purpose; drift of a few pixels needn't be fixed or listed.
12. **Release flow** (Q4 and Q31, decided 2026-11-10, owner). One commit per step on `main`. No branch, no pull request; the owner reviews `main`. The push follows the repo's hard rules ([corpus/CLAUDE.md](../../CLAUDE.md)).

## The wrapper set: `web/src/components/ui/`

| File | What it is | From |
|---|---|---|
| `Modal.tsx` | Base UI `Dialog` and `AlertDialog`, props unchanged, plus `Modal.Title` (a `Dialog.Title`/`AlertDialog.Title`) and `disablePointerDismissal` for forms; `layerFor` and `useLayer` | `web/src/shell/Modal.tsx`, moved |
| `ConfirmDialog.tsx` | Base UI `AlertDialog`: `title`, `body`, `confirmLabel`, `pendingLabel`, `onConfirm` returning void or a promise | `web/src/list/ConfirmDialog.tsx`, moved and extended |
| `Menu.tsx` | Base UI `Menu` with `Trigger` (a `render` prop), `Portal`, `Positioner`, `Popup` and `Item` preset to `side`, `align`, `sideOffset={4}`, `collisionPadding={8}` | `web/src/list/Menu.tsx`, moved; `ComposeForm.tsx`'s two menus and `SnoozeMenu.tsx`'s use it |
| `Popover.tsx` | Base UI `Popover` with the same presets, `container` and `anchor` passed through | new; `AccountMenu.tsx`, `LabelMenu.tsx` (two) and `SearchBox.tsx` use it |
| `NavDrawer.tsx` | Base UI `Drawer` (decision 3): `open`, `onClose`, `returnFocus`, `children`; closed by a swipe, the backdrop, the close control or Esc; a visually hidden `Title` "Navigation" | `Shell.tsx:83-105`, moved out |
| `Toast.tsx` | Base UI `Toast`; `useToast()` keeps `show({ message, action, duration })` and its handle with `dismiss()`; one at a time (`Toast.Provider limit={1}`); a `Toaster` renders the provider, `Portal` and `Viewport` | `web/src/shell/toast.tsx`, rebuilt |
| `Switch.tsx` | Base UI `Switch`: `checked`, `onCheckedChange`, `disabled`, the ARIA props, a label slot | the five checkboxes above |
| `RadioGroup.tsx` | Base UI `RadioGroup` + `Radio.Root` + `Radio.Indicator`, in a `fieldset`-compatible shape with a `legend` | `Choice` in `GeneralSettings.tsx` |
| `ToggleGroup.tsx` | Base UI `ToggleGroup` + `Toggle`, guarded: an empty value is ignored so one item stays pressed once chosen, and arrow keys only move focus | `InviteCard.tsx:202-207` |

`IconButton.tsx`, `states.tsx`, `status.tsx` and the rest of `web/src/shell/` stay where they are: none wraps Base UI.

## Files you OWN

- `web/src/components/ui/**` (new), the files moved out of `web/src/shell/` and `web/src/list/`, and every import of them.
- `web/src/shell/Shell.tsx` (the drawer moves out), `web/src/shell/AccountMenu.tsx`, `web/src/composer/ComposeForm.tsx`, `web/src/snooze/SnoozeMenu.tsx`, `web/src/labels/LabelMenu.tsx`, `web/src/search/SearchBox.tsx`: the inline Base UI becomes wrapper calls.
- The eight dialog call sites that gain a `Title`, and `web/src/composer/ScheduleDialog.tsx`, `web/src/snooze/SnoozeMenu.tsx` (`disablePointerDismissal`).
- `web/src/settings/GeneralSettings.tsx`, `web/src/settings/VacationForm.tsx`, `web/src/push/WebPushToggle.tsx`, `web/src/invites/InviteCard.tsx`: the widgets above.
- `web/src/keys/ShortcutsHost.tsx:49` and `web/src/mobile/useListGestures.tsx:106`: the two class hooks become a `data-` attribute or a ref.
- The existing CSS rules for markup this brief changes: rename or move a class rule to the new part, don't restyle. Brief 03 turns them into utilities.
- The tests for all of the above (`web/src/shell/Shell.test.tsx` including its toast block at line 221, the settings and invite tests, `web/src/auth/SessionProvider.test.tsx:268`), changed to roles and text where they now read a class.
- New Playwright flows in `web/e2e/` for the drawer (open, focus, Esc, swipe) and the settings switches (decision 10).
- `scripts/conventions.json` only if decision 3's fallback is needed.
- Corpus: [wiki/overlays.md](../../wiki/overlays.md) (what maps to what, the wrapper paths), [wiki/decisions.md](../../wiki/decisions.md) (the Base UI entry gains the 2026-11-09 conventions line and the native-controls line), [wiki/status.md](../../wiki/status.md), [log.md](../../log.md).

## Files you must NOT touch

- `jmap/`, and `web/package.json`: every part needed ships in `@base-ui/react` 1.9.0, so no new dependency.
- Styling beyond renaming a rule's selector. No Tailwind here.
- The behaviours [wiki/overlays.md](../../wiki/overlays.md) records: the Escape guard, rendering a dialog inside the composer's top-layer `<dialog>`, focus return. They move with their wrappers unchanged.
- `web/src/composer/ComposerWindow.tsx`, the two comboboxes, `web/src/contacts/SenderHoverCard.tsx`, and the native controls.
- `web/src/render/` and the message sandbox.

## What to do

One commit per numbered step. After each, `npm run check` passes, with `check-base-ui` `--warn-only`, and the local Stalwart is up so the integration tests run.

1. **Before.** Run `check-base-ui` strict and record the counts by rule. Expect rule 3 at 7 and rule 12 at 10. Take Playwright screenshots, at 1280 and 390 px, of:
   - the toast ("Conversation archived. Undo");
   - the phone navigation drawer, and the tablet drawer;
   - the schedule-send dialog and the snooze custom-date dialog;
   - a confirm dialog;
   - settings with the five toggles and the `Choice` radios;
   - an invite card with its answer buttons;
   - each menu and popover open (more actions, snooze, labels, account, search options, send options).

   The brief 03 method has the bring-up.
2. **Move `Modal` and `ConfirmDialog`** with `git mv` into `web/src/components/ui/`. Update the imports. Add `Modal.Title`. Rule 3's count drops to 6 files.
3. **`Menu.tsx` and `Popover.tsx`.** Move `web/src/list/Menu.tsx`; build `Popover.tsx`; switch `ComposeForm.tsx`, `SnoozeMenu.tsx`, `LabelMenu.tsx`, `SearchBox.tsx` and `AccountMenu.tsx` over. Keep each one's `initialFocus`, `finalFocus` and `container` as they are today (`LabelMenu.tsx:78, 126`, `SearchBox.tsx:224`, `ComposeForm.tsx:261, 304`). Rule 3 reaches 0 except `Shell`.
4. **Titles and pointer dismissal.** Give each of the eight dialog sites a `Modal.Title`; pass `disablePointerDismissal` on `ScheduleDialog` and the snooze dialog. Rule 12's count drops to the pending state.
5. **`ConfirmDialog`'s pending state** (decision 7), and `EmptyLabelButton` returning its promise.
6. **`NavDrawer.tsx`** and `Shell` on it (decision 3). Keep: focus into the drawer on open, back to the menu button on close, Esc closing it, and a link press closing it; add the swipe to close. Run the spike first; stop and report if it fails.
7. **The toast on Base UI.** Keep:
   - the 8 s default duration and `null` for stay-until-dismissed;
   - one at a time, a new one replacing the old;
   - Undo running its action and closing;
   - the timer pausing on hover and focus;
   - a live region present before the first toast, so the first message is read out.

   The 12 files' `useToast()` calls are untouched.
8. **`Switch.tsx`**, and the five settings on it. Keep each one's label, `aria-describedby` and disabled state (`WebPushToggle.tsx:47-52`'s `busy` and `denied` cases).
9. **`RadioGroup.tsx`** and `Choice` on it; **`ToggleGroup.tsx`** and the invite answer on it, guarded (decision 9). Keep the legend and group names as the accessible names.
10. **The two class hooks** (`ShortcutsHost.tsx:49`, `useListGestures.tsx:106`) to a `data-` attribute, and the tests that read a class that this brief renames.
11. **After.**
    - Take the screenshots again. List every difference with its reason.
    - Run `check-base-ui` strict: rules 1-3 and 8-12 report 0 (rule 8's z-index half and rules 4-7 are brief 03's, and their counts go in the outcome note).
    - Update [wiki/overlays.md](../../wiki/overlays.md), [wiki/decisions.md](../../wiki/decisions.md), [wiki/status.md](../../wiki/status.md) and [log.md](../../log.md).

## Acceptance

- [ ] `grep -rn "@base-ui/react" web/src --include=*.ts --include=*.tsx | grep -v "components/ui/"` prints nothing.
- [ ] `check-base-ui` strict reports 0 for rules 1, 2, 3, 9, 10, 11 and 12. Rules 4-7 are left for brief 03, and their counts are in the outcome note.
- [ ] Every dialog has a `Title`: a test renders each of the eight sites and asserts `getByRole("dialog" | "alertdialog", { name })`.
- [ ] The schedule-send and snooze dialogs do not close on a press outside while a field has text. That is a test.
- [ ] `ConfirmDialog` cannot be closed by Esc or a press outside while its promise is pending. That is a test.
- [ ] The Escape guard still lets Esc close a field's own list inside a dialog without closing the dialog, and a dialog opened inside the composer window still portals into it. Both are tests.
- [ ] A second toast replaces the first, and Undo runs its action. Unit tests on the `Toast` wrapper, which holds that logic (decision 10).
- [ ] The navigation drawer opens, takes focus, returns it to the menu button on Esc, and closes on a swipe to the left and on a tap on the backdrop. A Playwright flow in `web/e2e/` (decision 10).
- [ ] The five switches toggle from the keyboard (Space) and report `role="switch"` with `aria-checked`: checked by the settings flow in `web/e2e/`, not by a wrapper unit test (decision 10).
- [ ] The invite answer: an arrow key moves focus between Yes, Maybe and No without sending a reply, and Space or Enter sends one. A test.
- [ ] `npm run test:e2e` passes (it needs Docker; if the session has none, the owner runs it, and the outcome note says so).
- [ ] The before and after screenshots at 1280 and 390 px show no visible change to layout or colour beyond what the brief changes on purpose (the drawer's swipe); drift of a few pixels is not listed.
- [ ] Every commit is on `main`; no branch or pull request.
- [ ] `npm run check` passes, and `bash corpus/lint.sh` ends clean.

## Interplay

- Brief 03 styles `web/src/components/ui/` with Tailwind on the parts, and removes the CSS rules this brief renamed.
- The skills library's `check-base-ui` heuristic for rule 9 may flag a `Dialog.Close` around an icon. That is a false positive, to report to the skill rather than to except here.
