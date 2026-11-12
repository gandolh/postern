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
- Style with Tailwind classes on the element, merged with `cn()` (`web/src/lib/cn.ts`). The one stylesheet is
  `web/src/styles/index.css`: the `@theme` tokens, the layer order, the document defaults and the composer's
  editor-body rules (the user's own content). No other `.css`, no `style` except computed geometry.
- Semantic tokens only: `bg-surface-raised`, `text-text-muted`, `rounded-md`, `z-popup`. No arbitrary colour
  (`bg-[#…]`, `color-mix(`), no raw z-index. A new token goes in `@theme` and in `cn.ts`'s lists.
- Phones are `max-sm:` (`--breakpoint-sm: 37.5rem`, tested against `shell/breakpoints.ts`); a list's or a
  conversation's own width is the container query `@max-[46rem]/list:` or `@max-[40rem]/conv:`.
- Text buttons are `Button`, text fields `Input`, icon buttons `IconButton`; a link or a trigger that must look
  like one takes `buttonClass()`, `inputClass()` or `iconButtonClass()`.
- The theme is the `light-dark()` tokens plus the `data-theme` switch (Light, Dark, System; light on a first
  visit): never a raw hex in a component.
- Tests and e2e select by role and name, with `data-testid` only where no role fits (the message frame's
  iframe): never by a styling class.
- A `!` is an error here: narrow instead. In a test it is a warning.
- `console` is an error here: a report with no UI gets an `eslint-disable-next-line` with its reason.
