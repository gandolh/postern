# Task 20: Base UI for the modal dialogs

## Context

On 2026-10-23 the owner asked for Base UI (`@base-ui/react`) in the apps that
still hand-build their interactive widgets, to match their other apps
(atrium, imbatranimOS, sports-app, trips, ro-housing, public-resource-map,
newspapper). Base UI is headless: it supplies focus handling, keyboard
behaviour and ARIA, and Postern keeps its own CSS and tokens.

Postern has two kinds of hand-built widget, so the work is split into two
briefs. This one covers the modal dialogs. Brief 21 covers the menus and
popovers. Each dialog below opens a native `<dialog>` with its own
`showModal` effect and `onClose` wiring:

- `web/src/list/ConfirmDialog.tsx`: "Delete forever?"
- `web/src/composer/Question.tsx`: "Send without the files?", "Discard
  this draft?", with Cancel focused first
- `web/src/auth/SessionExpiredDialog.tsx`
- `web/src/conversation/ShowOriginal.tsx`: the raw message source
- `web/src/attachments/ImageViewer.tsx`
- `web/src/keys/HelpSheet.tsx`: the keyboard-shortcut sheet
- `web/src/labels/LabelManager.tsx`: an inline `role="alertdialog"` for
  deleting a label

The pattern to copy is `../newspapper/ui/src/components/ui/Modal.tsx`: Base UI
`Dialog`, the app's own stylesheet, and the component's props unchanged.

## Files you OWN

```
the seven files above, their *.test.tsx, and the CSS files that style them
(list.css, composer.css, auth.css, conversation.css, attachments.css,
keys.css, labels.css: only the dialog rules)
web/package.json (dependencies only)  package-lock.json
corpus/wiki/{decisions,status}.md
```

## Files you must NOT touch

- `web/src/composer/ComposerWindow.tsx`. The composer is a window that
  switches between docked (non-modal) and full screen (modal) while the
  editor keeps its state. It stays a native `<dialog>` for now.
- `web/src/render/**`, `MessageFrame.tsx`, `srcdoc.ts`. Message HTML stays
  in the sandboxed frame. `ShowOriginal` shows text only, and nothing here
  may put message HTML into the app's DOM.
- `jmap/`, `dev/`.

## What to do

1. Add `"@base-ui/react": "1.9.0"` to `web/package.json` dependencies,
   pinned exactly like the rest, then run `npm install` from the root.
2. Consider one small shared wrapper (for example
   `web/src/shell/Modal.tsx`) if four or more dialogs end up with the same
   Root/Portal/Backdrop/Popup/Title shape. Otherwise use Base UI inline.
3. **Confirmations → `AlertDialog`**: `ConfirmDialog`, `Question` and the
   label delete in `LabelManager`. Keep each component's props and its
   initial focus (Cancel first in `Question`, via `initialFocus`). Outside
   presses don't dismiss an alert dialog. That matches today, so check it.
4. **The rest → `Dialog`**: `SessionExpiredDialog`, `ShowOriginal`,
   `ImageViewer` and `HelpSheet`. Map `onClose` to `onOpenChange(false)`.
   Keep every accessible name the tests query (`getByRole("dialog", { name })`).
5. Delete each hand-written `showModal`/`close` effect and the
   `typeof dialog.showModal === "function"` guards. Base UI handles focus
   return. Check that keyboard shortcuts stay off while a dialog is open
   (`web/src/keys/shortcuts.ts` looks for open dialogs: update its check if it keys
   off `dialog[open]`).
6. **Styles.** Move `dialog` / `::backdrop` rules onto the `Popup` and
   `Backdrop` classes, using `data-open`, `data-starting-style` and
   `data-ending-style` for any transition. Keep the look the same, including
   the phone layouts.
7. Add a `decisions.md` entry: Base UI for overlays and composite widgets,
   dated 2026-10-23, the owner's call to match their other apps. Rejected:
   keeping native `<dialog>` with hand-built wiring, and shadcn (it brings
   Tailwind). Note that the composer window is excluded and why. Update
   `status.md`.

## Acceptance

- `npm run check` (typecheck, lint, unit tests) and `npm run build` pass.
- `npm run test:e2e` passes against the local Stalwart (`npm run dev:mail`),
  `csp.spec.ts` included.
- Browser check against the local Stalwart, at 1440 px and 390 px. For
  Delete forever, Discard draft, the shortcut sheet (`?`) and the image
  viewer:
  - focus moves in;
  - Tab stays inside;
  - Escape closes;
  - focus returns to the trigger;
  - shortcuts don't fire underneath.
  Take before/after screenshots. They should match.
- No `showModal` call is left in the seven files.
- `bash corpus/lint.sh` passes.

## Outcome (2026-10-23)

Done, in `1218df5`. `@base-ui/react` 1.9.0 is pinned in `web/package.json`.
Six of the seven dialogs go through one wrapper, `web/src/shell/Modal.tsx`:

- `ConfirmDialog` and `Question` are `AlertDialog`s;
- `SessionExpiredDialog`, `ShowOriginal`, `ImageViewer` and `HelpSheet` are
  `Dialog`s.

The wrapper does four things:

- **Picks the layer.** The composer window stays a native `<dialog>`, and
  full screen it is modal in the top layer, with everything outside it inert.
  So a popup goes into its own closest `dialog:modal`, else the last one open
  (a session expiring under a full-screen composer), else `<body>`. `:modal`
  sits behind a try/catch, because jsdom doesn't know it.
- **Ignores an Escape a field inside already used.**
- **Gives initial focus** to `[data-autofocus]`, or a selector.
- **Styles the layer.** `shell/modal.css` gives the popups what the browser
  gave a modal `<dialog>` (fixed, centred by margin, `z-index: 200` over the
  docked composer at 55 and the toasts at 60) and one `.modal-backdrop`.

No `showModal`, `::backdrop` or `[open]` rule is left for the six.

Per dialog:

- **`Question`** keeps its own Escape handler (`preventDefault` +
  `stopPropagation`), so the composer around it stays open.
- **`SessionExpiredDialog`** can't be dismissed: Escape and the backdrop are
  ignored, so `closedby="none"` and the reopen-on-close workaround are gone.
- **`HelpSheet`** stays mounted, with `open` from its store. Every way out
  clears the search.
- **`ShowOriginal` and `ImageViewer`** start on Close through `data-autofocus`.
  Before, the native `showModal` beat `autoFocus` and focus started on
  Download.

**LabelManager's delete confirmation was not moved.** It is an inline box in a
table cell, with no trap, Escape or backdrop to hand over, and Base UI has no
inline alert part. A modal would change the settings page.

**Tests.**

- The confirmations are queried as `alertdialog` (`ConversationList`,
  `ContactsRoute`, `Composer`).
- The session test checks Escape and the backdrop instead of native
  cancel/close events. Base UI hides the app behind a modal from assistive
  tech, so its "still mounted" query passes `hidden: true`.
- `HelpSheet.test` checks `data-open`.
- `csp.spec.ts` finds the viewer by `[role=dialog]`.

Checked: `npm run check` (1166 tests with the dev Stalwart up) and `npm run
test:e2e` (34 passed, `csp.spec.ts` included, so Base UI runs under the
production CSP). In Chromium against the dev Stalwart, at 1440 and 390 px, for
Delete forever (from Spam), Discard draft (docked; and full screen, where the
question renders inside the modal composer and on top), the shortcut sheet
(`?`) and the image preview:

- focus moves in;
- Tab stays inside;
- Escape closes;
- focus returns to the trigger. The native dialogs often dropped it to
  `<body>`.

`j` doesn't move the list underneath. Before/after screenshots match, except
for the viewer's first focus. Nothing was deleted from the dev mailbox. The
e2e teardown restored the read marks. brief-board is down, so nothing was
posted there.
