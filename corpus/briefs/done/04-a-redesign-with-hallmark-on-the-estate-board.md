# Task 04: A redesign with Hallmark, on the estate board

**Depends on:**

- In Postern:
  - [brief 02](../done/02-base-ui-by-the-conventions.md), which settles the Base UI wrappers in `web/src/components/ui/`;
  - [brief 03](../done/03-the-web-app-to-tailwind.md), which puts the whole web app on one Tailwind stylesheet and token set (`web/src/styles/index.css`) and makes the Light / Dark / System choice and the light first visit sure. A redesign is then mostly a new token set and layout.
- In the owner's skills library:
  - brief 24, which vendors Hallmark as the design skill and adopts taste-skill 2.5's ideas (palettes and type dealt by trade, its copy layer);
  - the estate redesign board: one artifact with a page per app, owned by the skills library.
- The owner's answer of 2026-11-10 (Q39): no bake-off; Hallmark redesigns every web UI, keeping what is useful from taste-skill 2.5, and the owner approves each app on the board before any code changes.

**Runs before:** nothing. **Runs after:** 01 to 03, the redesign last. There is no server brief: Postern has no backend.

**Before you start:** run `brief-board guide` ([corpus/CLAUDE.md](../../CLAUDE.md)).

## Context

Postern is the owner's own webmail for the Stalwart mail server, over JMAP, shaped like Gmail: one operator, a list, a conversation, a floating composer, and settings. The browser is the whole application; there is no backend of our own.

### The screens (read 2026-11-10, `web/src/shell/router.ts` and `web/src/App.tsx`)

| Screen | Route | File |
|---|---|---|
| The shell: top bar, left navigation (wide, rail, phone drawer), status slot, toast | every page | `web/src/shell/Shell.tsx`, `web/src/shell/Nav.tsx`, `web/src/shell/AccountMenu.tsx`, `web/src/shell/toast.tsx` |
| Conversation list and its toolbar, rows, swipe on a phone | `#inbox`, `#starred`, `#snoozed`, `#sent`, `#drafts`, `#spam`, `#trash`, `#all`, `#label/<id>` | `web/src/list/ListRoute.tsx`, `ConversationList.tsx`, `Row.tsx`, `Toolbar.tsx`, `web/src/mobile/` |
| A conversation, its message cards, details, the sandboxed message frame, attachments | `#<list>/<conversationId>` | `web/src/conversation/ConversationView.tsx`, `MessageCard.tsx`, `MessageBody.tsx`, `web/src/attachments/` |
| Search, advanced search | `#search/<query>` | `web/src/search/` |
| The composer: docked, minimised, stacked, full screen, inline reply, schedule dialog | window over any route | `web/src/composer/ComposerWindow.tsx`, `ComposeForm.tsx`, `InlineReply.tsx`, `ScheduleDialog.tsx` |
| Labels, filters, snooze | menus and settings | `web/src/labels/`, `web/src/filters/`, `web/src/snooze/` |
| Contacts, scheduled | `#contacts`, `#scheduled` | `web/src/contacts/ContactsRoute.tsx`, `web/src/send/ScheduledRoute.tsx` |
| Settings (general, accounts, filters, labels, identities, vacation) | `#settings/<section>` | `web/src/settings/SettingsRoutes.tsx`, `GeneralSettings.tsx` and the files beside it |
| Invite card | inside a conversation | `web/src/invites/InviteCard.tsx` |
| Sign in, session expired | before sign-in, and over any page | `web/src/auth/SignInPage.tsx`, `SignInForm.tsx`, `SessionExpiredDialog.tsx` |
| Keyboard help | `?` | `web/src/keys/HelpSheet.tsx` |

The mail body itself renders in a sandboxed iframe whose CSS is generated in `web/src/render/srcdoc.ts`. It is not redesigned.

### What the design docs fix today

- [wiki/design.md](../../wiki/design.md) is the design: "Familiar layout, our own face" (Gmail's arrangement, Postern's identity, never Google's colours, logo or wordmark), the visual system of 2026-10-20, the settings the design must support, and the quality bar with a contrast table per token pair. [wiki/decisions.md](../../wiki/decisions.md), "Our own webmail, shaped like Gmail", records why the layout is Gmail's.
- The owner prefers familiar UI over metaphor: navigation stays conventional, and the layout stays recognisable to anyone who has used Gmail.
- [wiki/overlays.md](../../wiki/overlays.md) records the overlay behaviours that must survive: the Escape guard, dialogs inside the composer's top-layer `<dialog>`, focus return. [wiki/keyboard-and-accessibility.md](../../wiki/keyboard-and-accessibility.md) records the keyboard model.
- Postern's theme is `data-theme` of `system`, `light` or `dark` over `light-dark()` tokens, kept in this browser (Q18). Brief 03 makes the first visit light and System a visible choice. The redesign keeps both themes complete.

The redesign stays inside these decisions unless the owner reopens one on the board.

## Owner decisions

Answered 2026-11-10: Q39 (Hallmark, with taste-skill 2.5's useful parts; approval on the board first). Defaults: the proposal keeps Gmail's arrangement, the three layouts (wide, rail, phone) and the floating composer; it changes the visual identity (colour, type, shape, density) and the details. Anything that moves the layout, the keyboard model or the sandboxed message frame is flagged on the board as a reopened decision.

## Files you OWN

- `web/src/styles/index.css` (the tokens for both themes, radii, shadows, type, spacing) and the screens listed above, one commit each.
- [wiki/design.md](../../wiki/design.md), recorded from the shipped result, including the contrast table.
- Corpus: [wiki/decisions.md](../../wiki/decisions.md) (only if a decision changes), [wiki/status.md](../../wiki/status.md), [log.md](../../log.md).

## Files you must NOT touch

- `jmap/`.
- `web/src/render/` and the message sandbox: the mail body keeps its own CSS.
- `web/index.html`'s `theme-color` metas and the PWA manifest colour, unless the redesign changes the canvas colour; then they change with it, by hand, with the contrast table.
- The copy's meaning (the glossary's words, [wiki/glossary.md](../../wiki/glossary.md)). No invented facts or numbers.
- The Base UI wrappers' behaviour (brief 02) and the theme switch's mechanism (brief 03): the redesign changes how they look.

## What to do

1. **Today.** Take Playwright screenshots of every screen above at 1280 and 390 px, in light and dark, kept out of git (`web/e2e/screenshots/` is ignored). Include the list in each density, a conversation with an invite and attachments, every menu and popover, the docked and full-screen composer, the drawer, the toast, and the sign-in and session-expired screens.
2. **Propose.** With Hallmark (and taste-skill 2.5's trade palettes and copy layer where they help), make a proposal per screen, inside the recorded decisions. Check each against the Floor: contrast, a visible focus ring, a reduced-motion path, no invented facts, no broken phone layout.
3. **Board.** Put the proposals on this app's page of the estate board, beside today's screenshots at both widths.
4. **Approval.** The owner approves on the board. Nothing below starts before that, and the approval is recorded in `log.md` with its date.
5. **Build.** First as a token change in `web/src/styles/index.css` (colours for both themes, radii, shadows, type, spacing, density), then one screen per commit, on `main`. Keep the wrappers, the keyboard model and the theme choice working.

## Acceptance

- [ ] The owner's approval is on the board and recorded in `log.md` with the date.
- [ ] Contrast: every text and icon pair in both themes clears 4.5:1 (3:1 for large text and UI parts), measured with a script over the built tokens, and the table in [wiki/design.md](../../wiki/design.md) is updated.
- [ ] A Playwright test tabs through each screen and asserts a visible focus ring on every stop.
- [ ] A Playwright test with `reducedMotion: "reduce"` asserts no running animation or transition on each screen.
- [ ] A Playwright test at 390 px asserts `document.documentElement.scrollWidth <= window.innerWidth` on each screen.
- [ ] Every figure and label shown comes from the data or the copy; the outcome note lists none invented.
- [ ] The theme tests from brief 03 pass for Light, Dark and System, and a first visit still shows light.
- [ ] `npm run check` passes, `npm run test:e2e` passes (or the owner has run it), and `bash corpus/lint.sh` ends clean.

## Interplay

- Brief 03 owns the stylesheet, the tokens' names and the theme choice; this brief changes their values and the layout. Brief 02's wrappers are restyled through the tokens, not rewritten.
- Brief 01's formatter and lint run on every redesign commit.
- The e2e suite (the CSP, hostile mail and reload specs) selects by role after brief 03, so a redesign that keeps roles and names keeps it green.

## Outcome (2026-11-13)

Built on `main`, local commits `b08e359` (approval), `f21a5b4` (tokens), `fc114f6` (shell), `bf70ec0` (list), `2c5f95b` (conversation), `0974fd7` (virtual list fix), `4807ac7` (composer), `d8d0a5b` (Floor specs, contrast script, nav width), `4199503` (design.md, decisions.md), `6cf985c` (theme and row specs) and the corpus commit that moves this brief. Not deployed (owner step: `node cli.ts postern deploy`, from the `vps-deploy` checkout; static web client only). The direction is "The reading desk", approved on the board on 2026-11-13.

- **What shipped.** The tokens of the board in `index.css` (the canvas `#e8ebe7` / `#0d110f`, deeper dark surfaces, stronger hover and border steps; per-size line heights, `--list-width`, `--lhead-height`, `--bottombar-height`; every colour name kept). The shell is two islands on the canvas: a 56 px top bar with a 44 px search pill, a 240 px navigation, the list island (440 px) and the reading pane. Rows have three lines (72, 64 and 52 px as floors), an unread dot in the gutter, a subject that wraps, star and Important stacked in the right padding. One 48 px list head (Select, the label, the range, Refresh; the actions of a selection replace the label). The reader has a head band (toolbar and subject, a 3 px rule on top) and two-line folded messages. The composer is 520 px tall, as wide as the pane. Under 600 px a 64 px bottom bar (Inbox, Starred, Sent, Labels) replaces the menu button; an open conversation takes the whole screen. The loading rows draw still (`--animate-skeleton` and `--color-skeleton-shine` went). Native checkboxes have the board's 18 px look.
- **Decisions.** Three reopened lines are dated entries in `wiki/decisions.md`, each with the old line kept: the reading pane's default (`none` to `right`), the phone's navigation (hidden until the menu opens it, to the bottom bar), the row density (one line of 48, 40, 32 px, to three lines). `wiki/design.md` is rewritten from what shipped. The `theme-color` metas and the manifest's `theme_color` / `background_color` followed the canvas (`#e8ebe7` light, `#0d110f` dark; the controller's call). The favicon drawn in `live/title.ts` still has the old canvas hex for its gate (`#f2f4f1`): it is the icon's own colour, left as it was.
- **Contrast** (`node scripts/contrast.mjs`, in `npm run check`): 36 pairs, none under its minimum. Lowest text pair: 4.6 in light (`text-subtle` on `surface-sunken`), 5.6 in dark (`text-muted` on `row-selected`). Lowest UI part: 3.06 in light (`border-strong` on `canvas`), 3.96 in dark (`border-strong` on `surface`). The island edge (`border` on `canvas`) is 1.64 and 1.61, a quiet edge, not a control.
- **Floor** (Docker-free `web/e2e/desk/`, 73 tests passed): a visible focus ring on every Tab stop, no running animation under reduced motion and no sideways scroll at 390 px, each on 20 screens; the brief 03 theme assertions with the new canvas; the whole rows on the first screen: 9 at 1280x800, 10 at 1440x900, 8 at 390x844, 7 at 360x800. The focus spec found one real gap, fixed: a date field's calendar button never matched `:focus-visible`.
- **Test data.** A `page.route` stub of `/webmail-api` (`web/e2e/desk/stub.ts`) built from `dev/seed/` (the alice mailbox: 2,038 messages in the Inbox head), a frozen clock, the event stream held open. Never a real mailbox, never Ward.
- **Unit tests that changed with the design:** none failed. No test assumed the `none` default or a fixed row height (the list tests run in jsdom, where `useVirtualRows` falls back to its estimate).
- **No string changed.** Copy is as it was; the unread dot reuses the `Unread, ` screen-reader text.
- **Screens against their comps** (the twins, rendered with the app's fonts, diffed by pixel, channel difference above 24, at the same viewport; the data differs: the comps' rows start at Calendar and open Saturday plans, the stub's start at Olga Klein). 1280: list 20.4% light, 14.4% dark; conversation 20.7%, 15.7%; composer 19.1%, 13.3%. 390: list 11.1% and 11.0%; conversation 17.9% and 17.4%; composer 2.5% and 8.1%. Still different, and why: (1) the comps open Saturday plans beside the list, the stub opens nothing, so the pane differs in the list shots; (2) the open conversation in the long-thread shot is scrolled to its inline reply draft, the comp is at the top; (3) the phone's open message header stacks the date and actions on their own row, the comp puts "to me" and the actions on one row; (4) the top bar's search starts 16 px nearer the left than in the comp at 1280, and the brand column is 240 px; (5) the comps' row text is drawn with the data of their own fixture (an emoji cup, 17 rows in the range) while the stub's seed gives 1-9 of 2,038. The checked head, Spam head, loading rows and Q4 comp (14 messages) were not shot against the comp.
- **Undrawn screens restyled** (tokens and the sheet's patterns, no new layout; shot once per width, light and dark, in the screenshot folder): sign-in, the rail and the drawer (rail at 768; the drawer by its tokens), the account menu, search and advanced search, keyboard help, full-screen composer, starred, sent and spam lists, the invite card, attachments, settings (general, accounts, labels, filters), contacts, scheduled. Not shot: session expired, the toast, the composer minimised and stacked, the inline reply, the schedule dialog, the labels, filters and snooze menus (they take the tokens through the shared wrappers; a toast and a dialog need a mail action the stub does not answer).
- **Check at 1024 and 768:** the composer at 1024 is 352 px wide (its floor, 22rem) over a 328 px pane, so it overhangs the list's right edge; at 768 the bars sit at the foot, no band under them.
- **Owner steps.** `node cli.ts postern deploy` from `vps-deploy`. Then `npm run dev:mail` and `npm run test:e2e` once here: the Stalwart suite (the CSP, hostile-mail, reload, navigation and settings specs) needs Docker and could not run in this build.

Deviations: (1) **Phone breakpoints.** The comps' phone starts at 899 px of container width; the app keeps its under-600, 600 to 1023 and from-1024 layouts. (2) **The head's actions.** The comp shows Archive, Report spam, Delete, Mark as read and More with rows checked; the app keeps Snooze, Move to and Labels beside them, since the behaviours stay (on a phone the head wraps to two lines). (3) **Skeleton:** `ListSkeleton`'s `animated` prop now only decides the `status` announcement. (4) **`useVirtualRows`** takes a fourth argument, the rows' container, and measures each rendered row.
