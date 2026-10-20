# Task 12: Settings

## Context

Gmail's settings, trimmed to what JMAP and Postern can honour. Server-side
settings go through JMAP: identities and signatures, the vacation responder,
storage. Display settings have no JMAP home; where they live is an open
question this brief answers
([open-questions.md](../../wiki/open-questions.md)).

## Files you OWN

- `web/src/settings/**`: the settings pages and their routes
  (`#settings/general`, `#settings/accounts`, `#settings/labels`,
  `#settings/filters`; filters are brief 13)
- `web/src/prefs/**`: the display-preferences store
- `corpus/wiki/open-questions.md`, `corpus/wiki/decisions.md`: record where
  preferences live

## What to do

1. **Decide where display preferences live**, with the owner:
   - per device;
   - a JSON blob through JMAP FileNode, if Stalwart's `filenode` support fits;
   - a hidden settings message.

   Record it. Apply the same choice to brief 09's label colours if it was
   deferred.
2. **General:**
   - density, theme, reading pane (none, right, below), conversation view on
     or off;
   - undo-send delay (5, 10, 20, 30 s), images (ask, or always show);
   - keyboard shortcuts on or off (brief 14), desktop notifications (brief 11);
   - the vacation responder (`VacationResponse`: on, dates, subject, body,
     contacts only).
3. **Accounts:**
   - identities (`Identity/get` and `/set`): name, reply-to, text and HTML
     signature;
   - the default identity;
   - storage used out of quota (`Quota/get`), with a bar as in Gmail;
   - links to Stalwart's account page for the password, TOTP and app
     passwords.
4. **Labels:** the brief-09 manager, embedded here.
5. Settings apply immediately, without a save button, as Gmail's mostly do.

## Acceptance

- On `dev/`:
  - a signature set here appears in brief 08's composer;
  - the vacation responder auto-replies to a message from bob;
  - the storage bar matches `Quota/get`.
- Display preferences survive a reload (or a new device, per the decision).
- The decision is recorded in the wiki.

## Outcome (2026-10-20)

Built: General (theme, density, reading pane, undo-send delay, images ask or
always, shortcuts on or off, desktop notifications, allowed image senders,
the vacation responder), Accounts (identities with both signatures, the
default identity, the storage meter, links to Stalwart's account page),
Labels (brief 09's manager) and a placeholder for brief 13's Filters.
Preferences are per device as the owner decided; theme, density and reading
pane are device-wide so they apply before sign-in. The HTML signature
preview renders only in a sandboxed frame. On `dev/`: a signature reached the
composer, the vacation responder answered bob, and the storage bar matched
`Quota/get` with a test quota (removed afterwards). Left out: "conversation
view off" (filed as a todo) and "contacts only" for the vacation responder,
which Stalwart lacks. The composer does not read the default identity yet.
