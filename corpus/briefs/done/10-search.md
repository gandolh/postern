# Task 10: Search

## Context

Gmail's search box understands operators: `from:bob has:attachment
after:2026/01/01 -in:trash`. JMAP's `Email/query` filter conditions and its
AND / OR / NOT operators cover nearly all of them, and `SearchSnippet/get`
gives the highlighted excerpts. Mapping:
[gmail-on-jmap.md](../../wiki/gmail-on-jmap.md).

## Files you OWN

- `jmap/src/search/**`: the operator parser and the filter builder (pure,
  heavily unit-tested)
- `web/src/search/**`: the search box, suggestions, the advanced-search
  dropdown, the results view with highlighted snippets

## What to do

1. **Parse:**
   - `from: to: cc: bcc: subject:`, `has:attachment`;
   - `is:unread / read / starred / important`, `in:` and `label:` (names to
     IDs), `in:anywhere`;
   - `before: after: older_than: newer_than:` (Gmail's date forms),
     `larger: smaller:`;
   - `"exact phrases"`, `-negation`, `OR`, and parentheses;
   - bare words go to `text`.

   Unknown operators fall back to text, with a hint.
2. **Default scope** matches Gmail: everywhere except Spam and Trash, unless
   `in:` says otherwise.
3. **Results** are conversations with `SearchSnippet` highlights, paged like
   the list (brief 06), with the same bulk actions.
4. **Suggestions while typing:** matching contacts (brief 15 later; recent
   senders for now), matching labels, and recent searches kept in memory for
   the session.
5. **The advanced-search dropdown** (from, to, subject, has the words, doesn't
   have, size, date within, label, has attachment) writes the operator string
   back into the box.

## Acceptance

- Parser unit tests cover every operator, negation, `OR`, quoting, and
  malformed input.
- On `dev/`, `from:bob has:attachment` and `is:unread label:<x>` return what
  `Email/query` returns for the equivalent hand-built filter.
- Snippets highlight the matched terms. Results support every brief-06 action.

## Outcome (2026-10-20)

Built. `parseSearch` in `@postern/jmap` covers every operator in the spec
plus Gmail's `{a b}` braces; `OR` binds tighter than a space, as in Gmail.
Results reuse brief 06's list with `SearchSnippet` highlights. The search box
is a combobox with label, recent-sender and recent-search suggestions (kept
in memory) and pluggable sources for brief 15. On `dev/`, `from:bob
has:attachment` and `is:unread label:work` return exactly the hand-built
filter's ids. Stalwart limits found are in
[gmail-on-jmap.md](../../wiki/gmail-on-jmap.md): no prefix matching, phrases
not enforced, no header search.
