# Task 03: The web app to Tailwind

**Depends on:**

- In Postern:
  - brief 01, for the gate, the formatter and the `.claude/rules/web.md` this brief extends;
  - brief 02, which puts the Base UI wrappers in `web/src/components/ui/` and settles their markup, so this brief styles each part once, in its final place.
- In the owner's skills library:
  - brief 02, *A base-ui skill, styled with Tailwind*: rules 4-8, the `tailwind.md` reference and the method in `migrating-from-plain-css.md`;
  - brief 27, *A house style, and a quality harness that enforces it*: the `better-tailwindcss` lint;
  - brief 07, *Postern's web app to Tailwind*, the estate draft this brief replaces.
- The owner's grilling of 2026-11-10:
  - Q17 (token names);
  - Q18 (dark mode);
  - Q19 (visual parity);
  - Q20 (the order of the migrations);
  - the new questions in the decisions below.

**Before you start:** run `brief-board guide` ([corpus/CLAUDE.md](../../CLAUDE.md)).

## Context

The owner's call of 2026-11-09: Base UI is styled with Tailwind v4, and whole apps move to Tailwind, not only the Base UI parts. Postern's web app is plain CSS on tokens today, the largest in the estate. This brief moves all of it to Tailwind with the looks unchanged. It revisits the Tailwind half of [wiki/decisions.md](../../wiki/decisions.md)'s "Base UI under the overlays; the composer window stays native", which rejected shadcn because it brings Tailwind. The composer window staying native is not revisited.

### Corrections to the estate draft

The estate draft (skills library brief 07) was written from a survey. Measured again on 2026-11-09:

- **95 custom properties:** not reproduced. `web/src/theme/tokens.css` declares **80 unique names in 90 declarations** (the rest are the density overrides and the reduced-motion block). `grep -oE "^\s*--[a-z0-9-]+:" web/src/theme/tokens.css | tr -d ' :' | sort -u | wc -l` prints 80.
- **A dark variant through `@custom-variant dark`:** not needed, and the draft's selector would be wrong. Postern's theme is `data-theme` of `system`, `light` or `dark` (`web/src/theme/ThemeProvider.tsx:23`). The colours are `light-dark(<light>, <dark>)`: 37 of the 90 declarations, resolved by the element's `color-scheme`. `tokens.css:145-151` pins `color-scheme` for `light` and `dark`; with `system` or no attribute, `:root { color-scheme: light dark }` follows the OS live. Those two `[data-theme` selectors are the only ones in all 19 stylesheets (`grep -rn "data-theme" web/src --include=*.css`). No rule differs by theme except through a token, so there is nothing for a `dark:` variant to do. See decision 2.
- **11 `@media` blocks:** confirmed (`grep -c "@media"` summed over the CSS). Four are `prefers-reduced-motion` (`web/src/composer/composer.css:820`, `web/src/list/list.css:541`, `web/src/theme/base.css:360`, `web/src/theme/tokens.css:167`); seven are width queries (`auth.css:213`, `composer.css:806`, `shell.css:828, 835`, `contacts.css:15`, `mobile.css:109`, `scheduled.css:82`). Plus **3 `@container` queries** the draft did not count: `web/src/list/list.css:510, 527` (named `list`, declared at `list.css:18-19`) and `web/src/conversation/conversation.css:629` (named `conv`, declared at `conversation.css:10-11`).
- **`mobile.css` is not a whole phone layout in one block.** Of its 359 lines, lines 19-107 are touch-gesture rules that apply at every width (the swipe backdrop, the pull indicator), one `@media (max-width: 37.4375rem)` block runs from line 109 to about 331, and `.mobile-compose` closes the file (332-359). The phone layout is also spread through `shell.css:835`, `composer.css:806`, `auth.css:213` and `scheduled.css:82`. The draft's "fold it into responsive variants" is right; "last" is still right.
- **5 `@keyframes`:** confirmed: `compose-in` (`composer.css:52`), `shell-pop` (`shell.css:236`), `shell-drawer-in` (`shell.css:544`), `shell-toast-in` (`shell.css:819`), `skeleton-shine` (`base.css:351`).
- **Fonts** come from two Fontsource packages through `web/src/theme/fonts.ts`, not from CSS. They stay in TypeScript.
- **No `@layer`, `@import`, `@font-face`, `@supports` or `@page` anywhere** in the CSS (`grep -rn "@layer\|@import\|@font-face" web/src --include=*.css` prints nothing). The root `font-size` is the browser's 16 px (`base.css:18-21` sets only `text-size-adjust`), so Tailwind's rem scale needs no adjustment.

### The stylesheets today

19 files, 5,736 lines (`find web/src -name '*.css' | xargs wc -l`). They are imported from 35 places in TypeScript, not from one entry: `grep -rn 'import ".*\.css"' web/src` finds the two in `web/src/main.tsx:3-4` (`tokens.css`, `base.css`) and 33 in components, several of them cross-feature (`web/src/list/list.css` is imported from four other features, `labels.css` from `Nav.tsx:16`, `snooze.css` from `web/src/list/Row.tsx:15`).

| File | Lines | Imported from | Notes |
|---|---|---|---|
| `web/src/composer/composer.css` | 886 | `web/src/composer/ComposerHost.tsx:14` | the compose window, the editor body (`.compose-editor-body p, ul, ol, pre, h1-h3, a, table` at 410-453, the user's own content), `compose-in` keyframes, a phone `@media` at 806, reduced motion at 820 |
| `web/src/shell/shell.css` | 878 | `web/src/shell/Shell.tsx:23` | layout grid, nav (21 `[data-nav` selectors), drawer, toast region, 3 keyframes, `@media` at 828 and 835 |
| `web/src/conversation/conversation.css` | 665 | `web/src/conversation/ConversationView.tsx:51` | the thread, banners, details; `@container conv` at 629; 8 `.lucide` descendant rules |
| `web/src/list/list.css` | 545 | `web/src/list/ListRoute.tsx:17`, `ConversationList.tsx:43`, `filters/` ×3, `web/src/settings/VacationForm.tsx:17` | the grid, the toolbar, rows; `@container list` at 510 and 527; reduced motion at 541 |
| `web/src/theme/base.css` | 364 | `main.tsx:4` | reset, element defaults, and 11 shared classes: `.btn` (+`-primary`, `-quiet`, `-soft`), `.chip`, `.icon-btn` (with the `data-tooltip` pseudo-element, 229-272), `.input`, `.kbd`, `.lucide`, `.skeleton`, `.visually-hidden` |
| `web/src/mobile/mobile.css` | 359 | `web/src/mobile/useListGestures.tsx:22`, `ComposeButton.tsx:9` | see above |
| `web/src/labels/labels.css` | 358 | `LabelManager.tsx:19`, `LabelMenu.tsx:31`, `web/src/shell/Nav.tsx:16` | |
| `web/src/search/search.css` | 218 | `SearchRoute.tsx:19`, `SearchBox.tsx:17` | |
| `web/src/auth/auth.css` | 217 | `web/src/auth/SessionProvider.tsx:21` | sign-in; `@media` at 213 |
| `web/src/settings/settings.css` | 209 | `SettingsRoutes.tsx:14` | |
| `web/src/theme/tokens.css` | 172 | `main.tsx:3` | 80 tokens |
| `web/src/contacts/contacts.css` | 169 | `SenderHoverCard.tsx:18`, `ContactsRoute.tsx:23` | `@media (min-width: 64rem)` at 15 |
| `web/src/filters/filters.css` | 160 | `FiltersSettings.tsx:22`, `EmptyLabelButton.tsx:14` | |
| `web/src/attachments/attachments.css` | 158 | `AttachmentList.tsx:18` | |
| `web/src/keys/keys.css` | 101 | `web/src/keys/HelpSheet.tsx:10` | |
| `web/src/send/scheduled.css` | 93 | `ScheduledRoute.tsx:18` | `@media (max-width: 599px)` at 82 |
| `web/src/snooze/snooze.css` | 81 | `SnoozeMenu.tsx:13`, `web/src/list/Row.tsx:15` | |
| `web/src/invites/invites.css` | 79 | `InviteCard.tsx:21` | |
| `web/src/shell/modal.css` | 24 | `web/src/shell/Modal.tsx:14` | backdrop and popup, `z-index: 200` |

**Raw values outside the tokens: almost none.** No hex colour in any stylesheet but `tokens.css` (`grep -rnE "#[0-9a-fA-F]{3,8}\b" web/src --include=*.css | grep -v tokens.css` prints nothing), and two `font-size`s in px or rem outside it. Two hex colours do live outside CSS, kept in step with the tokens by hand: the `theme-color` metas in `web/index.html:6-7` (`#f2f4f1`, `#111513`) and the PWA manifest colour that `web/vite.config.ts` hashes (its comment names `--color-canvas`). Neither changes here.

**What the code reads from the CSS.** Selectors used as behaviour hooks are brief 02's (`.conv-page`, `.mobile-swipe-label`). The tests are this brief's: 9 unit-test selectors by class (`web/src/conversation/ConversationView.test.tsx` ×5, `web/src/filters/FiltersSettings.test.tsx`, `web/src/search/search.test.tsx:147`, `web/src/mobile/useListGestures.test.tsx`, `web/src/auth/SessionProvider.test.tsx:268`) and 51 in `web/e2e/` (`hostile.spec.ts` 24, `csp.spec.ts` 9, `conversation-view-off.spec.ts` 6, `reload.spec.ts` 5, `tokens.spec.ts` 4, `web/e2e/lib/app.ts` 2, `dns.spec.ts` 1). When a class goes, these go with it. Decision 8.

**Third-party and user DOM that stays selector-styled:**

- **The mail body** is in a sandboxed iframe whose CSS is generated in TypeScript (`web/src/render/srcdoc.ts:73, 100-102`, `baseCss` and `overridesCss`). Not touched.
- **The composer's editor body** (`.compose-editor-body p, ul, ol, pre, h1-h3, a, table, .postern_signature`, `composer.css:410-463`) styles elements the user's text creates. It stays as a few `@layer components` rules with a comment, which is rule 5's allowance for content DOM.
- **lucide-react's `.lucide`.** 22 stylesheet rules (`grep -rn "\.lucide" web/src --include=*.css | wc -l` prints 22) size and colour an icon by its parent's state (`.list-star[aria-pressed="true"] .lucide`, `.shell-nav-item[aria-current="page"] .lucide`). The base size stays in `@layer base` (`base.css:95`); the state ones become `[&_.lucide]:` variants or `className` on the icon, whichever reads shorter at each site.

### The token mapping plan

`tokens.css` already uses Tailwind's namespaces, which keeps this small. All names stay Postern's (decision 1).

| Postern token | Count | In `@theme` | Becomes |
|---|---|---|---|
| `--color-*` | 34 | `--color-*` unchanged, each `light-dark()` value kept | `bg-surface`, `text-text-muted`, `border-border-strong`. Three aliases (`--color-row: var(--color-surface)`, `tokens.css` "list rows") stay as they are. |
| `--text-xs…2xl` | 6 | `--text-*` unchanged (0.75, 0.8125, 0.875, 1, 1.25, 1.5 rem) | `text-xs`, `text-sm`, `text-md`, `text-lg`, `text-xl`, `text-2xl` (`md` is Postern's own size name, so `extendTailwindMerge` must know it, decision 5) |
| `--radius-sm…xl, pill` | 5 | `--radius-*` unchanged | `rounded-md`, `rounded-pill` |
| `--shadow-sm, md, lg` | 3 | `--shadow-*` unchanged, `light-dark()` inside | `shadow-md` |
| `--font-sans`, `--font-mono` | 2 | `--font-*` unchanged | `font-sans`, `font-mono` |
| `--leading-tight`, `-normal` | 2 | `--leading-*` unchanged | `leading-normal` |
| `--weight-regular…bold` | 4 | `--font-weight-*` (renamed) | `font-medium`, `font-semibold` |
| `--space-0…12` | 10 | none: set `--spacing: 0.25rem` (Tailwind's default) | every step is a multiple: `--space-0` (0.125rem) is `0.5`, 1 is `1`, 2 is `2`, 3 is `3`, 4 is `4`, 5 is `5`, 6 is `6`, 8 is `8`, 10 is `10`, 12 is `12`. So `p-4` is 1rem exactly. |
| `--duration-fast/normal`, `--ease-out` | 3 | `--ease-out` as `--ease-out`; the durations stay plain variables, used as `duration-(--duration-fast)` | the reduced-motion block (`tokens.css:167`) keeps zeroing them, so every transition honours it without a variant |
| `--row-height`, `--row-padding-inline`, `--nav-item-height`, `--toolbar-height` | 4 (set in 3 density blocks, `tokens.css:135-165`) | **not** in `@theme`: they change at runtime with `data-density`, so they stay plain custom properties in `@layer base` | `h-(--row-height)`, `px-(--row-padding-inline)` |
| `--topbar-height`, `--nav-width`, `--nav-rail-width`, `--icon-size`, `--icon-stroke`, `--focus-ring`, `--focus-offset` | 7 | plain variables (not theme-namespaced); `--focus-ring` is a full `border` shorthand | `h-(--topbar-height)`, `outline-(--focus-ring)` or a base rule |

**Z-index scale** (rule 8). 27 declarations, 15 distinct values (`grep -rn "z-index" web/src --include=*.css`): 1, 2, 3, 6, 8, 20, 40, 45, 50, 55, 60, 70, 80, 100, 200. Group them into named layers in step 2 from the selectors, as far as the stacking contexts allow. A draft from the evidence: `sticky` (1-3: row swipe, page header, toolbars), `raised` (6-20: compose drop and suggestions, the hover card), `nav` (40-55: scrim, drawer frame, compose layer, tooltip at 50), `popup` (60-80: toast region, menu and popover positioners, the full-screen composer at 70, the compose menu at 80), `skip` (100) and `modal` (200). Two are order-sensitive and need a test by eye: the composer's own menu (80) over its window (70), and the toast region (60) under a modal (200). Tailwind has no theme namespace for z-index, so the tokens are plain variables, `z-(--z-popup)`.

**Breakpoints.** Postern has three layouts: wide (`min-width: 64rem`), a rail in between, and phone (`max-width: 37.4375rem`). `web/src/shell/breakpoints.ts` repeats the numbers for JavaScript (`WIDE_QUERY`, `PHONE_QUERY`) and says "CSS repeats the same values". Tailwind's `lg` is already 64rem. Set `--breakpoint-sm: 37.5rem` (Tailwind's is 40rem), so `max-sm:` is `width < 37.5rem`, the same boundary to within a hundredth of a rem. The width queries to port: `shell.css:828` (`max-width: 63.9375rem`, so `max-lg:`), `shell.css:835`, `composer.css:806`, `auth.css:213`, `mobile.css:109` (all phone), `scheduled.css:82` (`max-width: 599px`, so `max-sm:`) and `contacts.css:15` (`min-width: 64rem`, so `lg:`). Containers: `@container list (max-width: 46rem)` becomes `@max-[46rem]/list:`, and `container-type: inline-size; container-name: list` becomes `@container/list`.

### Gotchas Tailwind brings to this app

- **Legacy CSS beats utilities, unless it is layered.** The 19 files are unlayered, and any unlayered rule beats every layered Tailwind rule. So while a file is half-migrated, its leftover rule would silently override a utility on the same element. The mitigation is step 2: move all 35 imports into `web/src/styles/index.css` as `@import "../list/list.css" layer(legacy);`, with `@layer theme, base, legacy, components, utilities;` declared first, so utilities always win over legacy and deleting a file is deleting one line.
- **`light-dark()` inside `@theme`.** Tailwind passes the value through, but two things need a look in step 2's build: that the generated CSS keeps `light-dark(…)` literally, and that an opacity modifier (`bg-scrim/50`, `bg-accent/10`) still works, because it compiles to `color-mix(in oklab, var(--color-x) 50%, transparent)`. The two rgb-with-alpha tokens (`--color-scrim`, the shadows) don't take modifiers anyway.
- **The tooltip is a pseudo-element on an attribute** (`.icon-btn[data-tooltip]::after { content: attr(data-tooltip) }`, `base.css:229-272`, plus two overrides in `composer.css:514, 667`). It becomes `after:content-[attr(data-tooltip)]` with the hover and focus variants in `web/src/components/Button`-style variants. Brief 02's decision 4 may replace it with Base UI's `Tooltip`; this brief follows whichever won.
- **`cn()` and custom names.** `web/src/lib/cn.ts` is clsx plus tailwind-merge with `extendTailwindMerge`: the size name `md`, the `rounded-pill` radius, the `text-text*` colours (a colour named `text` is a legal `text-text` and would otherwise be read as a size or colour ambiguity) and `z-(--z-*)`. Without it, `cn("text-md", "text-text")` drops one.
- **Preflight.** Tailwind's preflight resets headings, buttons and form elements. `base.css` already resets (`box-sizing`, `body`, `a`, `p`, `textarea`); port whatever it adds beyond preflight to `@layer base`. The fallback if native selects, checkboxes or buttons shift: import `tailwindcss/theme.css` and `utilities.css` without preflight.
- **The service worker and the integrity hash.** `web/vite.config.ts` bakes a SHA-256 of every shell file into `sw.js` (finding F1, [wiki/security-findings.md](../../wiki/security-findings.md)). The Tailwind output is an ordinary Vite CSS asset, so the hash covers it; `web/src/sw/shell.test.ts` and the e2e reload and CSP specs prove it.
- **The CSP** (`style-src 'self' 'unsafe-inline'`, [wiki/security-headers.md](../../wiki/security-headers.md)): Tailwind adds no inline styles, and the eight `style={}` props set properties through the CSSOM. Nothing to loosen, and nothing to tighten here.

## Owner decisions (defaults this brief builds)

1. **Token names** (Q17). Default: Postern's names, put in Tailwind's namespaces as the table shows. No estate vocabulary.
2. **Dark mode** (Q18). Default: the `light-dark()` tokens and the `data-theme` switch stay exactly as they are, and there is **no** `@custom-variant dark` and no `dark:` in any class. The three-way preference (`system`, `light`, `dark`) is a `color-scheme` on the root, which a `dark:` variant keyed on a class or attribute cannot express without also reading the media query. If a non-token difference is ever needed, the variant is `@custom-variant dark (&:where(:root[data-theme=dark] *, :root:not([data-theme=light]):not([data-theme=dark]) *))` inside a `prefers-color-scheme` media, written then, not now.
3. **Visual parity** (Q19). Default: screenshots in light and dark at 1280, 1024, 800 and 390 px (the 800 px and 1024 px widths are the rail and the tablet drawer, which 1280 and 390 skip), with density `default`, and `compact` for the list and nav only. Every difference is fixed or listed with its reason.
4. **The shared classes** become components. Default: `.btn` (66 call sites in `className`, with `-primary`, `-quiet`, `-soft`), `.input` (43), and `.icon-btn` (the `IconButton` wrapper) become React components with variant props, in `web/src/components/` (`Button.tsx`, `Input.tsx`); `.chip` (3), `.kbd`, `.skeleton` (16) and `.visually-hidden` (15, which is Tailwind's `sr-only`) become utilities or a one-line component. The alternative, `@layer components` rules in `index.css`, keeps the class names but is what rule 5 says to avoid. *New question for the grilling.*
5. **Tailwind's scale against Postern's tokens.** Default: clear the default `--color-*`, `--text-*`, `--radius-*`, `--shadow-*` and `--font-*` (`--color-*: initial;` and so on), so only Postern's names exist; keep Tailwind's numeric spacing, since all ten `--space-*` steps map exactly. The off-scale numbers (`p-7`, `p-9`, `p-11`) then exist and the lint doesn't forbid them; a reviewer does.
6. **Preflight.** Default: Tailwind's, with what `base.css` adds beyond it ported to `@layer base`; the fallback is above.
7. **Motion** (rule 7). Default: parity. The five keyframes become `--animate-*` in `@theme`, under `motion-safe:`, and the four `prefers-reduced-motion` blocks go away because the durations already zero (`tokens.css:167`) and `motion-safe:` covers the animations. No new exit animations; Base UI's `data-starting-style` and `data-ending-style` come in only where a popup already animates.
8. **Tests that selected by class.** Default: replace each with a role and name, or with visible text; where neither exists, add a `data-testid` and use `getByTestId`, never a new class hook. 9 unit sites and 51 e2e sites, listed above. The mail-body iframe selectors (`.conv-page iframe`) become `getByTestId("conversation")`-style hooks. *New question: is `data-testid` the convention?*
9. **Where Postern falls in the estate's order** (Q20). Default: eighth, after the small apps and Almanac and Shelfmark, ahead of Newspapper. This brief depends on no other app's migration.
10. **Every stylesheet at once, or in stages.** Default: stages, in the order below, committed one file at a time with the gate green, because the legacy layer (above) makes any intermediate state safe.

## Files you OWN

- `web/src/**/*.css`: migrated and deleted, except the new `web/src/styles/index.css`.
- `web/src/styles/index.css` (new; `web/src/theme/tokens.css` and `base.css` go).
- The `className`s in `web/src/**/*.tsx`, and the 35 CSS imports.
- `web/src/lib/cn.ts` (new), `web/src/components/Button.tsx` and `Input.tsx` (new, decision 4).
- `web/package.json` (add `tailwindcss`, `@tailwindcss/vite`, `clsx` and `tailwind-merge`, pinned exactly; the lint plugin from brief 01), `web/vite.config.ts` (the plugin only) and `package-lock.json`.
- The tests that select by class (decision 8) and `web/e2e/` selectors.
- `web/src/shell/breakpoints.ts`: only to add the test that its numbers equal `index.css`'s `--breakpoint-*`.
- `.claude/rules/web.md`: the Tailwind lines.
- Corpus: [wiki/design.md](../../wiki/design.md) (its tokens section points at `index.css`; the conformance rules are unchanged), [wiki/decisions.md](../../wiki/decisions.md) (the revisit), [wiki/status.md](../../wiki/status.md), [log.md](../../log.md).

## Files you must NOT touch

- `jmap/`, and any non-web package.
- The composer window's native `<dialog>` behaviour (`web/src/composer/ComposerWindow.tsx`).
- The mail body's rendering: `web/src/render/` and the generated CSS in `srcdoc.ts`. If a conversation selector styles sanitised mail, that selector stays.
- `web/index.html`'s `theme-color` metas and the PWA manifest colour.
- The theme switch and the tokens' `light-dark()` values: moved, not edited.
- Behaviour. A class that was a behaviour hook is brief 02's; no logic changes here beyond selectors in tests.

## What to do

One commit per numbered step, and one per stylesheet in step 3. After each, `npm run check` passes with `check-base-ui` `--warn-only` until step 6, and the local Stalwart is up.

1. **Screenshots before.** Bring the app up as [docs/getting-started.md](../../../docs/getting-started.md) describes (`npm run dev:mail`, `npm run dev:seed`, `npm run dev`), keep the images out of git (`web/e2e/screenshots/` is already ignored), and capture, in light and dark at 1280, 1024, 800 and 390 px:
   - the list, a conversation, the composer docked and full screen;
   - search, advanced search, labels, filters, contacts, settings (each tab), keys, invites, snooze and scheduled send;
   - sign-in and the session-expired dialog;
   - every overlay open: each menu and popover, a confirm, the drawer, the toast, the tooltip.

   Record the gzipped size of the built CSS (`npm run build -w @postern/web`, then `gzip -c web/dist/assets/*.css | wc -c`) and the build time.
2. **Set up.**
   - Add `tailwindcss`, `@tailwindcss/vite`, `clsx` and `tailwind-merge`, pinned, and the Vite plugin.
   - Write `web/src/styles/index.css`: `@layer theme, base, legacy, components, utilities;`, `@import "tailwindcss"` with preflight per decision 6, the `@theme` from the mapping table, `--spacing`, the breakpoints, the density and layout variables in `@layer base`, and the `z` scale.
   - Replace the 35 TypeScript CSS imports with one `import "./styles/index.css"` in `main.tsx`, and add each existing file to `index.css` as `@import "…" layer(legacy);`.
   - Verify in the built CSS: `light-dark(` survives, `bg-<token>/50` compiles, the `sm` breakpoint reads 37.5rem.
   - Write `web/src/lib/cn.ts` with `extendTailwindMerge` (decision 5's names), and a test that `cn("text-md", "text-text")` keeps both.
   - Add the breakpoints test: `web/src/shell/breakpoints.ts`'s numbers equal `--breakpoint-sm` and `lg`.
   - Take the screenshots again: nothing should differ yet.
3. **Migrate one stylesheet at a time**, in this order, deleting each when it is empty and removing its `@import … layer(legacy)` line:
   1. `web/src/theme/base.css`: the reset and element defaults to `@layer base`; `.btn`, `.input`, `.icon-btn` to `Button`, `Input` and the `IconButton` wrapper (decision 4); `.chip`, `.kbd`, `.skeleton`, `.visually-hidden` to utilities; `.lucide`'s base size to `@layer base`.
   2. `web/src/theme/tokens.css`: already in `@theme`, so delete the file once its last consumer is gone.
   3. `web/src/shell/modal.css`, then `web/src/shell/shell.css`: the grid, the nav (the 21 `[data-nav` selectors become `data-[nav=drawer]:` and friends), the toast region (it moves into brief 02's `Toast`), the drawer, and the keyframes.
   4. `web/src/list/list.css`, with `web/src/snooze/snooze.css`: the `@container list` rules.
   5. `web/src/conversation/conversation.css`: the `@container conv` rule and the eight `.lucide` rules.
   6. `web/src/composer/composer.css`: the window (the `data-placement` attribute selectors become `data-[placement=fullscreen]:`), and **the editor body's element rules stay** as `@layer components` with a comment.
   7. The feature files: `labels.css`, `search.css`, `auth.css`, `settings.css`, `contacts.css`, `filters.css`, `attachments.css`, `keys.css`, `scheduled.css`, `invites.css`.
   8. `web/src/mobile/mobile.css` last: lines 109-331 fold into `max-sm:` variants on the elements `shell`, `list`, `composer` and `auth` already style; the gesture rules (19-107) and `.mobile-compose` become utilities on their own elements.

   At each file, port the selectors that tests or e2e read (decision 8) in the same commit, so the suite stays green.
4. **Lint.** Turn on `better-tailwindcss`'s correctness rules and its class order as errors, and fix what they find.
5. **Screenshots after.**
   - Take the same set. Compare each pair, light and dark.
   - Fix every difference, or list it in the outcome note with its reason.
   - Re-check the two stacking cases (the composer's menu over its window, the toast under a modal).
   - Record the CSS size and build time against step 1.
   - Run `npm run test:e2e`, which proves the CSP, the hostile-mail suite and the reload behaviour on the real build (it needs Docker; if the session has none, the owner runs it and the outcome note says so).
6. **Corpus.**
   - [wiki/design.md](../../wiki/design.md): the tokens section points at `web/src/styles/index.css`; the contrast table and the conformance checklist stay.
   - [wiki/decisions.md](../../wiki/decisions.md): revisit the Base UI entry, "Base UI under the overlays; the composer window stays native". Say what changed (Tailwind), what stayed (the native composer window, the two comboboxes, the sender card) and why (the owner's 2026-11-09 call), and keep shadcn as rejected for its own reasons.
   - [wiki/status.md](../../wiki/status.md), [log.md](../../log.md).
   - `.claude/rules/web.md`: Tailwind lines (semantic tokens only, no arbitrary colours, one stylesheet, `cn()`).
   - `bash corpus/lint.sh` clean.
7. **The gate.** Drop `check-base-ui`'s `--warn-only` from `check:conventions`.

## Acceptance

- [ ] `find web/src -name '*.css'` prints only `web/src/styles/index.css`, and `grep -rn 'import ".*\.css"' web/src` prints only the one in `main.tsx`.
- [ ] `grep -rn "\.module\.css" web/src` and `grep -rnE "className=.*-\[(#|rgb|hsl)" web/src` print nothing, and `check-base-ui` strict reports 0 for every rule.
- [ ] `grep -rn "dark:" web/src` prints nothing, and the theme switch still works: a test sets `data-theme` to each of `system`, `light` and `dark` and asserts the root's computed `color-scheme` (the repo's tests already drive `ThemeProvider`).
- [ ] The breakpoints test passes: `breakpoints.ts` and `index.css` agree.
- [ ] `cn("text-md", "text-text")` keeps both classes. A test.
- [ ] No test or e2e spec selects by a styling class: `grep -rnE "(locator|querySelector(All)?|closest)\(['\"\`]\.[a-z]" web/src web/e2e --include=*.test.* --include=*.spec.* --include=*.ts` prints only selectors for the mail body's own content.
- [ ] `npm run check` passes, and `npm run test:e2e` passes (or the owner has run it).
- [ ] The before and after screenshots match, light and dark, at the four widths, with every difference listed and explained. The CSS size before and after is in the outcome note.
- [ ] The decision revisit and the `log.md` entry are done, and `bash corpus/lint.sh` ends clean.

## Interplay

- Brief 02 puts the Base UI parts in `web/src/components/ui/`, so each is styled once, here, with `data-[open]:`, `data-starting-style:` and the positioner variables (`origin-(--transform-origin)`, `max-h-(--available-height)`).
- Brief 01's reformat touches two of these files (`shell.css`, `tokens.css`) and this brief deletes them.
- The skills library's `better-tailwindcss` setup (brief 27) needs the entry point `web/src/styles/index.css` and Postern's custom names; give the plugin the `extendTailwindMerge` list from `cn.ts`.
