---
paths:
  - "web/src/**"
---

# Editing the web app

Read the `base-ui` skill before UI work, then [wiki/design.md](../../corpus/wiki/design.md) and
[wiki/overlays.md](../../corpus/wiki/overlays.md). Run `npm run check:fast` before handing back.

- Message HTML goes only into the sandboxed `<iframe>`, never into the app's DOM
  ([wiki/security.md](../../corpus/wiki/security.md)).
- The access token lives in memory, the refresh token in `sessionStorage`, nothing in `localStorage`
  ([wiki/decisions.md](../../corpus/wiki/decisions.md)).
- Base UI goes through the app's own wrappers, imported from subpaths. A trigger around a component
  uses `render`. The wrappers land with the Base UI migration; until then leave the existing imports.
- Dialogs come from the `Modal` wrapper, which holds the Escape guard and initial focus. The composer
  window stays a native `<dialog>`.
- The two comboboxes (recipients, search) and the sender card stay hand-built
  ([wiki/decisions.md](../../corpus/wiki/decisions.md)).
- Use the glossary's words in UI copy ([wiki/glossary.md](../../corpus/wiki/glossary.md)).
- The theme is the `light-dark()` tokens plus the `data-theme` switch: never a raw hex in a component.
- A `!` is an error here: narrow instead. In a test it is a warning.
- `console` is an error here: a report with no UI gets an `eslint-disable-next-line` with its reason.
