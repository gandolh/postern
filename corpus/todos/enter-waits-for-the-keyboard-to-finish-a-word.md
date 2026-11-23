---
title: Enter waits for the keyboard to finish a word
created: 2026-11-23
status: open
tags: [web, phone]
---

# Enter waits for the keyboard to finish a word

From the modern-web-guidance research of 2026-11-23 (my-personal-skills, `corpus/wiki/modern-web-guidance-2026-11-23.md`
there). Unverified on a phone: confirm it before building.

A phone keyboard with word suggestions, and any input method for accented or non-Latin text, composes a word before
it commits it. An Enter pressed during that composition belongs to the keyboard. Two Enter handlers here act on it
anyway:

- `web/src/composer/RecipientInput.tsx`: Enter (and Tab) commits the typed text as a recipient.
- `web/src/labels/LabelMenu.tsx`: Enter picks the only label shown.

On Android Chrome the likely symptom is a recipient or a label taken from a half-finished word, or the keyboard's
own Enter swallowed. The global shortcuts already skip composition (`web/src/keys/shortcuts.ts`, which returns early
on `event.isComposing`), so the fix is the same check in both handlers: return when `event.nativeEvent.isComposing`
is true, or when `keyCode` is 229, which Safari still sends for the Enter that ends a composition. The
`web-platform` skill (my-personal-skills brief 44) will carry the guide `forms/ime-safe-enter-submit.md` with the
details.

First step: on an Android phone with Gboard, type a recipient whose last word is still underlined, press Enter, and
see what happens. If nothing goes wrong, close this todo with what was seen.
