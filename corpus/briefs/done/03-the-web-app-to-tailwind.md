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
  - Q18 (the Light / Dark / System switch, light on a first visit);
  - Q19 (visual parity);
  - Q20 (the order of the migrations);
  - Q62 (type scale, breakpoints, tests by role);
  - the questions still open in the decisions below.

**Before you start:** run `brief-board guide` ([corpus/CLAUDE.md](../../CLAUDE.md)).

## Context

The owner's call of 2026-11-09: Base UI is styled with Tailwind v4, and whole apps move to Tailwind, not only the Base UI parts. Postern's web app is plain CSS on tokens today, the largest in the estate. This brief moves all of it to Tailwind with the looks unchanged. It revisits the Tailwind half of [wiki/decisions.md](../../wiki/decisions.md)'s "Base UI under the overlays; the composer window stays native", which rejected shadcn because it brings Tailwind. The composer window staying native is not revisited.

### Corrections to the estate draft

The estate draft (skills library brief 07) was written from a survey. Measured again on 2026-11-09:

- **95 custom properties:** not reproduced. `web/src/theme/tokens.css` declares **80 unique names in 90 declarations** (the rest are the density overrides and the reduced-motion block). `grep -oE "^\s*--[a-z0-9-]+:" web/src/theme/tokens.css | tr -d ' :' | sort -u | wc -l` prints 80.
- **A dark variant through `@custom-variant dark`:** the draft's selector would be wrong, and no class needs it today, but Q18 (decision 2) has every app declare one keyed off `data-theme`. Postern's theme is `data-theme` of `system`, `light` or `dark` (`web/src/theme/ThemeProvider.tsx:23`). The colours are `light-dark(<light>, <dark>)`: 37 of the 90 declarations, resolved by the element's `color-scheme`. `tokens.css:145-151` pins `color-scheme` for `light` and `dark`; with `system` or no attribute, `:root { color-scheme: light dark }` follows the OS live. Those two `[data-theme` selectors are the only ones in all 19 stylesheets (`grep -rn "data-theme" web/src --include=*.css`). No rule differs by theme except through a token, so no class needs `dark:`. See decision 2, which also changes the no-attribute default to light.
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

## Owner decisions

Decided on 2026-11-10 (the owner's grilling; the technical calls are marked, and the owner may overrule them). An item no answer covers stays a default.

1. **Token names** (Q17, decided 2026-11-10, technical call). Postern keeps its names, put in Tailwind's namespaces as the table shows. Only the small-tools family (wicket, the-board, lantern) converges on `surface`, `ink`, `accent`, `line` and `danger`; other apps keep their names until their redesign (brief 04).
2. **Light, Dark and System** (Q18, decided 2026-11-10, owner: a switch everywhere, light by default). Postern already has the switch, and the estate copies its method: `data-theme` on `<html>` is `system`, `light` or `dark`, the choice is kept in this browser with the other display settings, and the colours are `light-dark()` tokens resolved by `color-scheme`. Two things were not true yet, and step 4 makes them so:
   - **A first visit shows the light theme, not the system's.** Today `DEFAULT_DISPLAY_SETTINGS.theme` is `"system"` (`web/src/theme/displaySettings.ts:33`), and with no `data-theme` on `<html>` the root's `color-scheme: light dark` follows the OS. The default becomes `"light"`, and the root without an attribute is `color-scheme: light`. A stored choice is never overwritten.
   - **System is a visible choice.** The theme setting offers Light, Dark and System (today the third reads "Same as the device"), and System follows the OS live.
   - **`dark:` keys off `data-theme` through `@custom-variant`**, as the estate's apps do: `@custom-variant dark (&:where([data-theme=dark], [data-theme=dark] *))`, plus the same rule under `@media (prefers-color-scheme: dark)` for `data-theme=system`. No class needs `dark:` today, because the tokens already carry the difference; the variant is declared so a later non-token difference has a hook, and Postern's method is the one the other apps use.
3. **Visual parity** (Q19, decided 2026-11-10, owner: close enough). Done means before and after screenshots at 1280 and 390 px show **no visible change to layout or colour**, in light and dark. Drift of a few pixels in spacing or rounding needn't be fixed or listed. The rail (800 px) and tablet-drawer (1024 px) widths are checked once, as layout thresholds: the right layout shows.
4. **The shared classes** become components. Default: `.btn` (66 call sites in `className`, with `-primary`, `-quiet`, `-soft`), `.input` (43), and `.icon-btn` (the `IconButton` wrapper) become React components with variant props, in `web/src/components/` (`Button.tsx`, `Input.tsx`); `.chip` (3), `.kbd`, `.skeleton` (16) and `.visually-hidden` (15, which is Tailwind's `sr-only`) become utilities or a one-line component. The alternative, `@layer components` rules in `index.css`, keeps the class names but is what rule 5 says to avoid. *Still open for the owner.*
5. **Tailwind's scale against Postern's tokens** (Q62, decided 2026-11-10, technical call: a named type scale in `@theme`; no `phone` variant). Clear the default `--color-*`, `--text-*`, `--radius-*`, `--shadow-*` and `--font-*` (`--color-*: initial;` and so on), so only Postern's names exist: the type scale is Postern's named `--text-xs` to `--text-2xl`. Keep Tailwind's numeric spacing, since all ten `--space-*` steps map exactly. The off-scale numbers (`p-7`, `p-9`, `p-11`) then exist and the lint doesn't forbid them; a reviewer does. There is **no `phone` variant**: the phone layout uses `max-sm:` with `--breakpoint-sm: 37.5rem`, and the one-pixel edge is accepted.
6. **Preflight.** Default: Tailwind's, with what `base.css` adds beyond it ported to `@layer base`; the fallback is above. The root font size is already the browser's 16 px (Q44 needs no change here).
7. **Motion** (rule 7). Default: parity. The five keyframes become `--animate-*` in `@theme`, under `motion-safe:`, and the four `prefers-reduced-motion` blocks go away because the durations already zero (`tokens.css:167`) and `motion-safe:` covers the animations. No new exit animations; Base UI's `data-starting-style` and `data-ending-style` come in only where a popup already animates.
8. **Tests that selected by class** (Q62, decided 2026-11-10, technical call). Its 60 class-based test selectors (9 unit sites and 51 e2e sites, listed above) **move to roles**: a role and name, or visible text. `data-testid` only where no role fits, and never a new class hook. The mail-body iframe selectors (`.conv-page iframe`) become `getByTestId("conversation")`-style hooks, since an iframe has no better role.
9. **Where Postern falls in the estate's order** (Q20, decided 2026-11-10, technical call): ninth, after the todo app, wicket, the-board, lantern, Satchel, ward-auth, Almanac and Shelfmark, ahead of Newspapper. This brief depends on no other app's migration.
10. **Every stylesheet at once, or in stages** (decided: the `layer(legacy)` method the estate adopted, kept). Stages, in the order below, committed one file at a time with the gate green, because the legacy layer (above) makes any intermediate state safe.
11. **Release flow** (Q4 and Q31, decided 2026-11-10, owner). One commit per step on `main`. No branch, no pull request; the owner reviews `main`. The push follows the repo's hard rules ([corpus/CLAUDE.md](../../CLAUDE.md)).

## Files you OWN

- `web/src/**/*.css`: migrated and deleted, except the new `web/src/styles/index.css`.
- `web/src/styles/index.css` (new; `web/src/theme/tokens.css` and `base.css` go).
- The `className`s in `web/src/**/*.tsx`, and the 35 CSS imports.
- `web/src/lib/cn.ts` (new), `web/src/components/Button.tsx` and `Input.tsx` (new, decision 4).
- `web/package.json` (add `tailwindcss`, `@tailwindcss/vite`, `clsx` and `tailwind-merge`, pinned exactly; the lint plugin from brief 01), `web/vite.config.ts` (the plugin only) and `package-lock.json`.
- The theme choice (step 4): `web/src/theme/displaySettings.ts` (the default and the order), its tests, the theme labels in `web/src/settings/GeneralSettings.tsx`, and, only if the first-paint measurement needs it, one external script under `web/public/` with its `<script>` tag in `web/index.html` (the `theme-color` metas stay).
- The tests that select by class (decision 8) and `web/e2e/` selectors.
- `web/src/shell/breakpoints.ts`: only to add the test that its numbers equal `index.css`'s `--breakpoint-*`.
- `.claude/rules/web.md`: the Tailwind lines.
- Corpus: [wiki/design.md](../../wiki/design.md) (its tokens section points at `index.css`; the conformance rules are unchanged), [wiki/decisions.md](../../wiki/decisions.md) (the revisit), [wiki/status.md](../../wiki/status.md), [log.md](../../log.md).

## Files you must NOT touch

- `jmap/`, and any non-web package.
- The composer window's native `<dialog>` behaviour (`web/src/composer/ComposerWindow.tsx`).
- The mail body's rendering: `web/src/render/` and the generated CSS in `srcdoc.ts`. If a conversation selector styles sanitised mail, that selector stays.
- `web/index.html`'s `theme-color` metas and the PWA manifest colour.
- The tokens' `light-dark()` values: moved, not edited. The theme switch's mechanism stays; only its default and labels change (step 4).
- Behaviour. A class that was a behaviour hook is brief 02's; no logic changes here beyond selectors in tests.

## What to do

One commit per numbered step, and one per stylesheet in step 3. After each, `npm run check` passes with `check-base-ui` `--warn-only` until the gate step, and the local Stalwart is up.

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
4. **The theme choice** (decision 2, Q18). After the migration, so the tokens already sit in `index.css`.
   1. `web/src/theme/displaySettings.ts`: `DEFAULT_DISPLAY_SETTINGS.theme` becomes `"light"`. Update the tests that assert the default. A stored choice is untouched.
   2. `index.css`: `:root { color-scheme: light }`, `[data-theme="dark"] { color-scheme: dark }`, `[data-theme="system"] { color-scheme: light dark }`, and the `@custom-variant dark` of decision 2.
   3. `web/src/settings/GeneralSettings.tsx`: the theme choice reads Light, Dark and System, in that order (`THEMES` in `displaySettings.ts` is reordered, and the title "Same as the device" becomes "System").
   4. **No flash.** Today the stored choice is restored when `web/src/prefs/display.ts` loads and `ThemeProvider` sets the attribute in a layout effect. Measure the first paint with a stored `dark` choice. If it paints light first, add a small **external** classic script in `<head>` (`script-src 'self'` forbids an inline one, [wiki/security-headers.md](../../wiki/security-headers.md)) that sets `data-theme` from the stored choice, and check that the service worker's shell hash covers it (`web/src/sw/shell.test.ts`).
   5. Tests: each of `light`, `dark` and `system` sets the root's computed `color-scheme` (system follows `matchMedia` and a live change); a first visit with no stored choice and an OS in dark mode is light.
5. **Lint.** Turn on `better-tailwindcss`'s correctness rules and its class order as errors, and fix what they find.
6. **Screenshots after.**
   - Take the same set, in the light theme and in dark. Compare each pair at 1280 and 390 px: no visible change to layout or colour is the bar (decision 3), and a few pixels of drift is not listed. The rail and tablet widths are checked once, as thresholds.
   - List only what is visible, with its reason.
   - Re-check the two stacking cases (the composer's menu over its window, the toast under a modal).
   - Record the CSS size and build time against step 1.
   - Run `npm run test:e2e`, which proves the CSP, the hostile-mail suite and the reload behaviour on the real build (it needs Docker; if the session has none, the owner runs it and the outcome note says so).
7. **Corpus.**
   - [wiki/design.md](../../wiki/design.md): the tokens section points at `web/src/styles/index.css`; the contrast table and the conformance checklist stay.
   - [wiki/decisions.md](../../wiki/decisions.md): revisit the Base UI entry, "Base UI under the overlays; the composer window stays native". Say what changed (Tailwind), what stayed (the native composer window, the two comboboxes, the sender card) and why (the owner's 2026-11-09 call), and keep shadcn as rejected for its own reasons.
   - [wiki/status.md](../../wiki/status.md), [log.md](../../log.md).
   - `.claude/rules/web.md`: Tailwind lines (semantic tokens only, no arbitrary colours, one stylesheet, `cn()`).
   - `bash corpus/lint.sh` clean.
8. **The gate.** Drop `check-base-ui`'s `--warn-only` from `check:conventions`.

## Acceptance

- [ ] `find web/src -name '*.css'` prints only `web/src/styles/index.css`, and `grep -rn 'import ".*\.css"' web/src` prints only the one in `main.tsx`.
- [ ] `grep -rn "\.module\.css" web/src` and `grep -rnE "className=.*-\[(#|rgb|hsl)" web/src` print nothing, and `check-base-ui` strict reports 0 for every rule.
- [ ] The theme choice, with a test for each of the three: **Light** and **Dark** pin the root's computed `color-scheme`; **System** follows `prefers-color-scheme` and a live change of it. A **first visit** (no stored choice, the OS in dark mode) shows the light theme, and the default in `DEFAULT_DISPLAY_SETTINGS` is `"light"`. A stored choice survives a reload with no flash of the wrong theme. The setting reads Light, Dark and System. `@custom-variant dark` is declared in `index.css`, keyed off `data-theme`.
- [ ] The breakpoints test passes: `breakpoints.ts` and `index.css` agree.
- [ ] `cn("text-md", "text-text")` keeps both classes. A test.
- [ ] No test or e2e spec selects by a styling class: `grep -rnE "(locator|querySelector(All)?|closest)\(['\"\`]\.[a-z]" web/src web/e2e --include=*.test.* --include=*.spec.* --include=*.ts` prints only selectors for the mail body's own content.
- [ ] `npm run check` passes, and `npm run test:e2e` passes (or the owner has run it).
- [ ] The before and after screenshots at 1280 and 390 px, light and dark, show no visible change to layout or colour; visible differences are listed with their reason, and drift of a few pixels is not. The rail and tablet widths are checked once as thresholds. The CSS size before and after is in the outcome note.
- [ ] No test or e2e spec selects by a styling class: the 60 sites are on roles, with `data-testid` only where no role fits.
- [ ] Every commit is on `main`; no branch or pull request.
- [ ] The decision revisit and the `log.md` entry are done, and `bash corpus/lint.sh` ends clean.

## Interplay

- Brief 02 puts the Base UI parts in `web/src/components/ui/`, so each is styled once, here, with `data-[open]:`, `data-starting-style:` and the positioner variables (`origin-(--transform-origin)`, `max-h-(--available-height)`).
- Brief 01's reformat touches two of these files (`shell.css`, `tokens.css`) and this brief deletes them.
- Brief 04 (the redesign) follows this one: it changes the token values, both themes and the layout on the Tailwind base left here.
- The skills library's `better-tailwindcss` setup (brief 27) needs the entry point `web/src/styles/index.css` and Postern's custom names; give the plugin the `extendTailwindMerge` list from `cn.ts`.

## Outcome (2026-11-12)

Built on `main`, local commits `44eb2cb` (Tailwind in, every stylesheet moved), `e0d2b4a` (the theme choice), `560cd9e` (selectors by role, the lint strict), `d4945ff` (index.css tidied) and the corpus commit that moves this brief. Not deployed (owner step: `node cli.ts postern deploy`, from the `vps-deploy` checkout; static web client only).

- **The stylesheets.** `find web/src -name '*.css'` prints `web/src/styles/index.css` only. It holds the `@theme` (Postern's names, values kept, in Tailwind's namespaces), the layer order (`theme, base, vendor, components, utilities`; the built CSS has it in that order), the `dark` variant keyed off `data-theme`, the document defaults, the label palette, the phone density block, and the composer's editor-body element rules in `@layer components` (the user's own content, selected by a `data-editor-body` attribute). `check-base-ui` is strict: 0 errors, 2 rule-9 warnings (an icon inside `Menu.Trigger` / `Popover.Trigger`, the known false positive); `better-tailwindcss` order and unknown-class are errors over `web/`.
- **The shared looks.** `components/ui/Button.tsx` (Base UI's `Button`, variants default, primary, soft, quiet, danger, and `buttonClass()` for a link), `components/ui/Input.tsx` (`Input`, `inputClass()` for a select or textarea) and `shell/IconButton.tsx` (`iconButtonClass()` for a raw icon control; the tooltip is pseudo-element utilities). Decision 4 settled with the controller's ruling: components, not `@layer components` rules.
- **The theme.** `DEFAULT_DISPLAY_SETTINGS.theme` is `"light"`; the setting reads Light, Dark, System; root is `color-scheme: light`, `data-theme=dark` is dark, `system` is `light dark`. `web/public/theme-boot.js` (external, `script-src 'self'`) puts the kept choice on `<html>` before the first paint; the service worker's precache lists it. Tests: the default, the order and each choice's attribute in jsdom; in Chromium against the build (`web/e2e/theme.spec.ts`) the computed `color-scheme` and canvas colour for Light, Dark and System, System following an emulated change both ways, a first visit under a dark OS being light, and the first value on `<html>` being `dark` for a kept dark choice.
- **Tests by role.** The 60 class-based selectors are on roles and names; `data-testid` only on the message, signature-preview and image-viewer iframes and the swipe, pull and list-body hooks of the gesture test. `cn("text-md", "text-text")` keeps both (`lib/cn.test.ts`); `shell/breakpoints.test.ts` ties `breakpoints.ts` to `--breakpoint-sm` and Tailwind's `lg`.
- **Sizes** (before, then now). CSS 95,126 bytes (15,636 gzip), then 92,402 (16,959); main JS 928.46 kB (297,287 gzip), then 1,012.84 kB (319,649 gzip), of which tailwind-merge and clsx are about 9 kB gzip and the class strings the rest. `vite build` 1.3 s, then 1.4 s.
- **Checks.** `npm run check` exits 0 (1,321 tests, the three `compose-send` integration tests included, which pass against the dev Stalwart this time); `npm run test:e2e` passes, 54 of 54, `theme.spec.ts` included.
- **Screenshots.** From two clones, one script, a fixed clock, pixelmatch (threshold 0.1), at 1280, 390, 1024 and 800 px, light and dark (1024 and 800 light only): the same 26 views as before (list, conversation, composer docked and full screen, search, advanced search, labels, filters, contacts, settings, keys, invite, snooze and scheduled send, every menu, popover and confirm, the drawer, the toast, the tooltip). Almost every pair is pixel-identical. What differs: the settings General page (Theme reads Light, Dark, System, intended); a lingering "Action undone." toast in some `before` shots (a pause timer, as brief 02 noted); a few-pixel focus-outline difference in the label popover and the snooze dialog. A failure toast at 390 and 1280 (forced by aborting the JMAP route on Empty Trash) stays up and sits above the floating Compose button (toast bottom 820, button top 828): identical before and after, nothing to move.

Deviations: (1) **Order.** The stylesheets went in dependency order, not the brief's (the shared `.btn`, `.icon-btn`, `.input` classes last, since every file overrides them), and steps 2 and 3 are one commit: a script moved the classes, each file was then checked by hand against screenshots. (2) **Fonts** moved from `theme/fonts.ts` into `index.css` (`@import … layer(vendor)`), so `import ".*\.css"` prints only `main.tsx`; the brief said they stay in TypeScript. (3) **z scale** is `--z-index-*` in `@theme` (the skill: `z-popup`), 14 named steps at their old numbers, not plain variables. (4) The layer order has `vendor` after `base` (the skill). (5) **`theme-color` metas** and the manifest colour are untouched, as the brief says, so they still follow the system, not the switch. (6) The first-paint measurement was skipped: the boot script went in regardless, since a module script cannot run before the first frame. (7) `.icon-btn`-style class hooks and 18 hook-only classes (no rule) were removed; the tooltip stays pseudo-element utilities (brief 02 left Base UI's `Tooltip` open). (8) `hover:` applies only on hover devices, so a tap no longer leaves a hover state behind. (9) The `render.test.ts` fixture string `@import "x.css"` still matches the acceptance grep: it is mail-body test data.
