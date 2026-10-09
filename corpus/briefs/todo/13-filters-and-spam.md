# Task 13: Filters, blocking and spam

## Context

Gmail's filters ("Filter messages like these"), block sender, and Report
spam / Not spam. On Stalwart, filters are Sieve scripts managed through JMAP
(`SieveScript`). Postern generates the Sieve from a Gmail-like form, so the
owner never writes Sieve. Whether Report spam trains Stalwart's filter is an
open question to answer here.

## Files you OWN

- `jmap/src/sieve/**`: the filter model and a Sieve generator and parser for
  the subset Postern writes, round-trip tested
- `web/src/filters/**`: the filter editor, "Filter messages like these", the
  filter list in `#settings/filters`, blocked addresses
- `web/src/actions/spam.ts`: report spam, not spam, empty Spam and Trash
- `corpus/wiki/open-questions.md`: answer the spam-training question

## What to do

1. **The filter model.**
   - Criteria: from, to, subject, has the words, doesn't have, has
     attachment, size.
   - Actions: skip the Inbox (archive), mark as read, star, apply label,
     forward to, delete, never send to Spam.
2. **Storage.** Generate one Postern-owned Sieve script with a header comment
   marking it generated, and activate it. Preserve any other active script the
   owner wrote by hand, and refuse to overwrite one Postern did not write.
3. **"Filter messages like these"** from a conversation pre-fills the criteria.
   Offer "Also apply to matching conversations", which runs the criteria as a
   search and applies the actions with `Email/set`.
4. **Block** "<sender>" from a message's menu adds a rule that sends future
   mail from that address to Spam. A list of blocked addresses in settings can
   unblock.
5. **Spam.**
   - Report spam moves to Spam and sets `$junk`; Not spam moves to the Inbox
     and sets `$notjunk`.
   - Find out whether Stalwart's classifier learns from these, against
     Stalwart's docs and source. Record it, and say so in the UI only if true.
   - "Delete all spam messages now" and "Empty Trash now" are confirmed
     actions.

## Acceptance

- Round-trip tests: model → Sieve → model for every criterion and action.
- On `dev/`, a filter "from bob → apply label X, skip Inbox" files bob's next
  message correctly, delivered over SMTP, not through Postern.
- Blocking an address sends its next message to Spam. Unblocking restores.
- A hand-written Sieve script survives Postern saving its own.
