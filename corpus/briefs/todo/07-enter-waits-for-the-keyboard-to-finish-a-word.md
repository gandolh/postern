# Task 07: Enter waits for the keyboard to finish a word

**Depends on:** nothing. **Runs after:** nothing.
**Builder:** Sonnet.
**Before you start:** run `brief-board guide` (the repo's `CLAUDE.md` says so).

Promoted 2026-11-25 from the todo `todos/enter-waits-for-the-keyboard-to-finish-a-word.md` (modern-web-guidance
research of 2026-11-23 in the skills library). The todo said "unverified on a phone"; the check moves to the owner
(below) and the fix is built now because it is one guard with no downside on a keyboard that does not compose.

## Context

A phone keyboard with word suggestions, and any input method for accented or non-Latin text, composes a word before
it commits it. An Enter pressed during that composition belongs to the keyboard. Two handlers act on it anyway:

- `web/src/composer/RecipientInput.tsx` (`onKeyDown`): Enter, and Tab with text typed, commits the text as a recipient.
- `web/src/labels/LabelMenu.tsx` (the search input's `onKeyDown`): Enter picks the only label shown.

On Android Chrome the likely symptom is a recipient or a label taken from a half-finished word, or the keyboard's own
Enter swallowed. The global shortcuts already skip composition (`web/src/keys/shortcuts.ts` returns early on
`event.isComposing`); Satchel's composer checks `event.nativeEvent.isComposing`. The fix is the same check: return,
with no `preventDefault`, when `event.nativeEvent.isComposing` is true or `event.keyCode === 229` (Safari still sends
229 for the Enter that ends a composition).

## Decisions

- One helper so the two handlers cannot drift: `isComposingKey(event)` in a new `web/src/lib/ime.ts`
  (`event: { nativeEvent: { isComposing: boolean }; keyCode: number }`, a structural type).
- In `RecipientInput` the guard covers both the Enter and the Tab branch (Tab also ends a composition in some
  keyboards); the Arrow and Escape branches are untouched. The Ctrl+Enter send path stays as it is: a held Ctrl is
  never part of a composition.
- Test through the existing component tests (React Testing Library is in use here): `fireEvent.keyDown(input,
  { key: "Enter", isComposing: true })` must change nothing, and the same event without `isComposing` must still
  commit. `LabelMenu.test.tsx` and `Composer.test.tsx` show the setup. Add a small unit test for the helper too
  (keyCode 229 case, which RTL's `fireEvent` can also send).

## Files you OWN

- `web/src/lib/ime.ts` and `web/src/lib/ime.test.ts` (new), `web/src/composer/RecipientInput.tsx`,
  `web/src/labels/LabelMenu.tsx`, and the new cases in `web/src/composer/Composer.test.tsx` and
  `web/src/labels/LabelMenu.test.tsx`.
- Closeout: outcome note, `corpus/log.md`, `corpus/wiki/status.md`, the todo's removal if the corpus rules delete it.

## Files you must NOT touch

- `web/src/keys/shortcuts.ts` (already correct), `jmap/`, `vendor/`, lockfiles, the integration tests.

## Steps

1. Write `isComposingKey` and its test: composing true, keyCode 229 with `isComposing` false, a plain Enter (false).
2. Call it at the top of the Enter/Tab branch in `RecipientInput` and the Enter branch in `LabelMenu`.
3. Add the component test cases (composing Enter: no chip and no label chosen; plain Enter: still works).
4. `npm run check:fast`, the touched test files, then `npm run check` once at the end.

## Acceptance

- [ ] The new tests pass: a composing Enter commits no recipient and picks no label; a plain Enter still does both; `ime.test.ts` covers keyCode 229.
- [ ] `npm run check` exit 0 (`CI=1` without the dev Stalwart, as earlier briefs ran it); `bash corpus/lint.sh` OK.
- [ ] End move: `Ready for deploy` (static web files only: Postern's deploy command in `vps-deploy`), with the owner test below listed.

## Owner steps

- After the deploy, on the Android phone (Gboard, suggestions on): in the composer's To field type a name or address
  fragment with a Romanian word containing diacritics and press Enter while the last word is still underlined.
  Expected: no recipient chip is made from the half word. Commit the word, press Enter: the chip appears. In the
  label menu's search field type a label name the same way (only one label matching): Enter during the underlined
  word must not pick it. Report what was seen.

## Owner decisions

- Settled 2026-11-25 (owner): promote it.
- Mine (technical): build the guard before the phone check, since it is harmless when there is no bug; Tab guarded
  together with Enter; a shared helper plus component tests.
