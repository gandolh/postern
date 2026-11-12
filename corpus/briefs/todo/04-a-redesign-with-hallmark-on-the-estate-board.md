# Task 04: A redesign with Hallmark, on the estate board

**Depends on:**

- In Postern:
  - [brief 02](../done/02-base-ui-by-the-conventions.md), which settles the Base UI wrappers in `web/src/components/ui/`;
  - [brief 03](03-the-web-app-to-tailwind.md), which puts the whole web app on one Tailwind stylesheet and token set (`web/src/styles/index.css`) and makes the Light / Dark / System choice and the light first visit sure. A redesign is then mostly a new token set and layout.
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
