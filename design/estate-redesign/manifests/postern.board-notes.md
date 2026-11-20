# The board's notes: Postern

The estate redesign board is a private canvas. This file copies what its page for this app said beside the screens: the owner's asks, the decisions, the rules the design reopened, the open questions and the Floor. The owner's answers are in [README.md](../README.md#the-owners-decisions).

## Asks to the owner

- 1. Reopened: the reading pane goes on by default (the default `none` becomes `right`) and the phone gets a bottom bar with Inbox, Starred, Sent and Labels, where design.md says the navigation is "hidden until the menu opens it". Is that on the table, or does Postern stay Gmail's full-width list? 2. Today's rows show an Important marker beside the star. Keep it in the 1280 row (as drawn), or drop it to give the subject room? The 390 row has none today and none here. 3. Approve The reading desk as Postern's direction? (beside `postern-direction`)

## Decisions

- Unread rows carry a patina dot hanging in the gutter beside the checkbox, as well as bold, so the subject and snippet share the sender's left edge. It is the list's signature: the rows are narrow, so bold alone did not separate new from read. The dot has a screen-reader label, "Unread"; a read row has no dot and regular weight. (beside `postern-proposed-list-1280`)
- A subject is never cut: it wraps to a second line before the snippet, and no row ends in an ellipsis. The snippet fades out at the row's edge instead, so the "…" that ends a seed snippet is dropped and nothing is extended. The count after a sender, and the Draft in red, stay. (beside `postern-proposed-list-1280`)
- The list leads: the reader's head band is a hairline-edged step (row-read) with a 3 px rule in the open row's colour on its top edge, not a strong tint. The open row keeps the tint and the accent bar, and is read (no dot, regular weight), which is what ties it to the pane. (beside `postern-proposed-list-1280`)
- The star and Important stack inside the row's right padding, not on the card edge, each 28 px on 1280 and 44 px on a phone. The paperclip sits on the date line on both widths, so an attachment row is no taller than the others. (beside `postern-proposed-list-1280`)
- Phone type: the subject is the dominant line, 16 px at 600; the snippet is 13 px, one step up from 12. The date and the sender keep their sizes. The list head names the label (Inbox at 24/32) and the search stays in the top bar. (beside `postern-proposed-list-390`)
- Nothing sits under Compose: the list pads by the bottom bar (64 px), Compose (56 px), two 16 px gaps and the gesture inset, 152 px. This frame is scrolled to the end: the last row, then a loading row at the row height, with the padding clear above the bar. (beside `postern-proposed-list-scrolled-390`)
- At 1280 the pane shows the longest seeded thread (Q4 roadmap review, 14 messages) so a long conversation can be judged; the open row is Carol ... Dave, Draft (15), and being open it is read: no dot, regular weight. Text and times are the seed's, set in the app's 12-hour form. (beside `postern-proposed-conversation-1280`)
- The fold is the app's own: the first message, a bar "10 older messages" with its count in a ring, then the last three, with the unread and the newest open. Reply, Reply all and Forward sit once, under the last message. (beside `postern-proposed-conversation-1280`)
- The composer is today's: an empty New Message, To in focus, a floating window 520 px tall, as wide as 560 px but never wider than the pane less 16 px and anchored to the pane's right edge, so the list stays readable while you write (checked at 1024). Drawn over the open Saturday plans. Fields get a 3:1 underline and a visible label; the formatting row stays open and Send stays the one filled button. (beside `postern-proposed-composer-1280`)
- Dark is its own palette: the canvas is #0d110f, the islands lift 1.20 over it, and the border does the work the shadow does in light. The patina is lighter with dark text on it; Discard is a coral fill with the dark surface as its label. (beside `postern-direction`)
- The list head and the toolbar are one 48 px row at both widths (Select all, Select, Inbox, the range, Refresh), where the direction had a 72 px head over a 48 px toolbar. With rows checked the label and range give way to Archive, Report spam, Delete, Mark as read and More; in Spam a link, Delete all spam messages now, joins it (both drawn on the sheet). (beside `postern-proposed-list-1280`)
- The reader's toolbar stays icon-only, each with its name and today's tooltip (research 3 asks for text or a tooltip); Compose, Send and the three reply buttons carry words. (beside `postern-proposed-list-1280`)
- Atkinson Hyperlegible Next and its Mono stay: its l, I and 1 differ and so do 0 and O, which is what spotting a lookalike sender address needs (design.md). (beside `postern-direction`)
- On a phone an open conversation takes the whole screen: its toolbar replaces the top bar and the bottom bar and Compose go, as in Gmail's; the search, Settings and the account are one tap back in the list. Today keeps the top bar here. The message header keeps Star, Reply and More at 44 px, and the sender's address always has its own line, never clipped. (beside `postern-proposed-conversation-390`)
- The search pill grows to 720 px as today's does, and the conversation's subject is 20/28 700 at 1280, the same as Inbox, so the list leads; the phone keeps 24/32. (beside `postern-proposed-list-1280`)

## Reopened rules

- Recorded (design.md, Reading pane): "none, right, below", with `none` the default; and under Layouts: "under 600 px it is hidden until the menu opens it" (the navigation). Proposed: the pane defaults to `right` at 1280 and stays off on phones, as the code does today; `none` and `below` stay as settings. The phone gets a bottom bar, and the drawer opens from its Labels tab with the whole tree, so the top bar drops the menu button. (beside `postern-proposed-list-1280`)
- Recorded (design.md, Densities): rows 48, 40 and 32 px, with a row of one line. Proposed: three-line rows of 72 px with 6 px padding (comfortable 64 with a 12/16 snippet, compact 52 with no snippet line), so the list and the phone share one row; the phone row has no height floor (about 75 px). A subject that wraps to two lines grows the row to about 91 px, which the virtual list must measure; the list is 440 px, the top bar 56 and the list head 48. (beside `postern-proposed-list-390`)

## Open questions

- The app pulses its loading skeleton today; this sheet draws it still, as research prefers. Keep it still? The composer's send-failed and sending toasts are today's strings; the other states are the app's own copy. (beside `postern-direction`)

## The Floor

- Contrast is scripted over 58 pairs in both themes: text min 5.24 light and 5.25 dark; icons, edges, the unread dot and focus rings min 3.06 and 3.48 (the search pill's edge on the canvas is the 3.06); the two islands stand 1.20 off the canvas with a 1.64 edge on white. A read row differs from an unread one by only 1.09 light and 1.08 dark in tone, so weight and the dot carry the difference. No sideways overflow and no control spilling its box at 1280, 1100, 1024, 768, 390 or 360 in either theme (exit 0); phone targets are 44 px or more except the row's own link and its star column. First screen, rows whole: at 1280x800 today shows 14 and this shows 9; at 390x844 today shows 9 and this shows 8 (three-line rows, wrapped subjects, a 64 px bottom bar). Sloplint --scope app --render gives 0 FAIL and 0 REFLEX on the eight Proposed twins; three WARNs stay (F7 pill radius on controls, avatars and the dot; F24 the composer's edge with its shadow; F25 desktop-only words, since the pane is off on phones). The fixed 1440 sheet is not linted. The sheet draws the states of all three screens, including the list head with rows checked and in Spam. (beside `postern-direction`)

## Other notes

- Two lint accommodations: the count "1‒17 of 2,038" is set with the figure dash U+2012, which looks like the app's en dash (Hallmark gate 19 fails on U+2013 and cannot be waived); and the cup in "Café-Treffen am Samstag?" is drawn as an inline icon because gate 30a bans an emoji in the markup. In the app both stay as the data has them.
- The cup in a subject is drawn as an icon (gate 30a); wrapped subjects need a measured virtual list, which the direction's fixed row heights did not. Layout and token changes for the code brief are in postern.tokens.css and its map: no colour is renamed, twelve values change, and the new tokens are per-size line heights, --list-width and --bottombar-height.

## Contrast, as measured

| Pair | Light | Dark | Needs |
|---|---|---|---|
| text on canvas (navigation labels) | 13.84 | 15.44 | 4.5 |
| text-muted on canvas (counts, Labels head) | 6.14 | 9 | 4.5 |
| text on hover (navigation hover) | 12.44 | 11.05 | 4.5 |
| text on row (unread sender, subject) | 16.64 | 12.86 | 4.5 |
| text on row-read (read sender, subject; the reader's head band) | 15.31 | 13.9 | 4.5 |
| text on row-hover | 14.57 | 11.79 | 4.5 |
| text on row-selected (open row, Draft excepted) | 13.32 | 9.62 | 4.5 |
| text on surface-raised (composer fields, menu items) | 16.64 | 11.32 | 4.5 |
| surface on danger (Discard label) | 6.54 | 7.32 | 4.5 |
| text on surface-sunken (composer head) | 13.06 | 14.72 | 4.5 |
| text-muted on row (snippet, date, address) | 7.38 | 7.49 | 4.5 |
| text-muted on row-read (snippet, date on a read row, the band) | 6.79 | 8.1 | 4.5 |
| text-muted on row-hover (snippet on a hovered row) | 6.47 | 6.87 | 4.5 |
| text-muted on row-selected (snippet on the open row) | 5.91 | 5.6 | 4.5 |
| text-muted on surface-sunken (chip text, composer labels) | 5.8 | 8.58 | 4.5 |
| text-muted on surface-raised (To, Subject, Cc, Bcc) | 7.38 | 6.6 | 4.5 |
| text-subtle on surface (search placeholder) | 5.8 | 6.22 | 4.5 |
| on-accent-soft on accent-soft (selected label, count, active tab) | 8.73 | 8.85 | 4.5 |
| on-accent-soft on row-selected (avatar letters on the open row) | 8.73 | 8.85 | 4.5 |
| on-accent-soft on surface (avatar letters in the pane) | 10.91 | 11.83 | 4.5 |
| on-accent on accent (Compose, Send, avatar letter) | 6.46 | 7.99 | 4.5 |
| on-accent on accent-hover (Compose hovered) | 8.81 | 9.36 | 4.5 |
| accent on surface (links, Try again) | 6.46 | 8.19 | 4.5 |
| accent on canvas (links on the canvas) | 5.38 | 9.84 | 4.5 |
| danger on row (Draft in a sender list) | 6.54 | 7.32 | 4.5 |
| danger on row-read (Draft on a read row) | 6.02 | 7.92 | 4.5 |
| danger on row-selected (Draft on the open row) | 5.24 | 5.48 | 4.5 |
| danger on surface-raised (error text, Discard) | 6.54 | 6.45 | 4.5 |
| danger on danger-soft (error band) | 5.33 | 6.95 | 4.5 |
| on-warning-soft on warning-soft | 8.87 | 10 | 4.5 |
| on-inverse on inverse (toast text) | 13.36 | 13.51 | 4.5 |
| inverse-accent on inverse (Undo) | 9.13 | 5.25 | 4.5 |
| accent on row (the unread dot) | 6.46 | 8.19 | 3 |
| accent on row-hover (the dot on a hovered row) | 5.66 | 7.52 | 3 |
| accent on canvas (the dot is never on the canvas; the mark is) | 5.38 | 9.84 | 3 |
| border-strong on canvas (search pill edge; the field needs 3:1) | 3.06 | 4.75 | 3 |
| border-strong on surface (checkbox, outlined button edge) | 3.67 | 3.96 | 3 |
| border-strong on row-read (checkbox on a read row) | 3.38 | 4.28 | 3 |
| border-strong on surface-raised (field underline, chip edge, outlined pill) | 3.67 | 3.48 | 3 |
| text-muted on row-selected (checkbox edge on the open row) | 5.91 | 5.6 | 3 |
| text-muted on surface (row icons: star, Important, paperclip) | 7.38 | 7.49 | 3 |
| star on row (starred icon) | 4.44 | 8.67 | 3 |
| star on row-read | 4.09 | 9.37 | 3 |
| star on row-selected | 3.56 | 6.48 | 3 |
| focus ring on canvas | 5.38 | 9.84 | 3 |
| focus ring on surface | 6.46 | 8.19 | 3 |
| focus ring on row-read | 5.95 | 8.86 | 3 |
| focus ring on row-selected | 5.17 | 6.13 | 3 |
| focus ring on surface-raised | 6.46 | 7.21 | 3 |
| surface on canvas (the two islands; needs 1.09 or an edge) | 1.2 | 1.2 | 1.09 |
| border on surface (island edge, row divider; needs 1.3) | 1.64 | 1.61 | 1.3 |
| border on canvas (island edge seen from the canvas; needs 1.3) | 1.36 | 1.94 | 1.3 |
| row-selected on surface (the open row and the pane's accent rule) | 1.25 | 1.34 | 1.15 |
| surface on canvas (search pill and bottom bar; edge adds 1.3) | 1.2 | 1.2 | 1.09 |
| border on surface-raised (composer and menus; needs 1.3) | 1.64 | 1.42 | 1.3 |
| surface-raised on canvas (composer over the pane's island is on surface: edge and shadow) | 1.2 | 1.36 | 1.09 |
| row-read on row (read against unread; weight and the dot carry the rest) | 1.09 | 1.08 | 1.05 |
| row-read on surface (the reader's head band against the island; hairline adds 1.3) | 1.09 | 1.08 | 1.05 |

## The runner-up

**Runner-up: A, Patina, settled (sketch only, not built)**

Note: how this direction was picked. Two directions were sketched (A evolve today, B the reading desk) and two judges compared every pair against today, in both orders, at 1280 light and 390 dark. All 12 verdicts agreed: B won 4 of 4, A 2, today 0. One judge called both today and A near-literal Gmail. A lost to B on grouping: list and conversation as two cards, the open row tied to the pane. The cost is density: 9 whole rows at 1280x800 against today's 14. Say so here if you'd rather keep one full-width list (A).

## The artboards on the board

- Direction · The reading desk
- Inbox · 1280 · light · today
- Inbox · 390 · light · today
- Conversation · 1280 · light · today
- Conversation · 390 · light · today
- Composer · 1280 · light · today
- Composer · 390 · light · today
- Inbox · 1280 · light · proposed
- Inbox · 390 · dark · proposed
- Conversation · 1280 · light · proposed
- Conversation · 390 · dark · proposed
- Composer · 1280 · light · proposed
- Composer · 390 · dark · proposed
- Inbox · 390 · dark · scrolled to the end · proposed
- Runner-up A, Patina, settled · light 1280 (sketch)
- Runner-up A, Patina, settled · dark 390 (sketch)
