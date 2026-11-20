fix

# postern, "The reading desk": critique (2026-11-12)

Read from the renders in `board/work/postern/shots/`, today's `board/shots-existing/postern-03/after-*`, and headless measurements of the twins at real viewport sizes. B's direction holds up: two islands, a labelled navigation, rows a phone and a desktop share, and a phone that names its label. What it owes is first-screen density, plus three deviations that are half-drawn.

## Regressions against today

1. **First-screen density, list at 1280 and 390.** Whole rows on the first screen, measured from the twins with the frame set to each height. Today's counts come from its 48 px rows (64 top bar, 48 toolbar, 16 bottom gap) and its 80 px phone rows (64 + 48 of chrome, no bottom bar).

   | Viewport | Today | Build | With fix 1 below |
   |---|---|---|---|
   | 1280×800 (the board's frame) | 14 | 7 | **8** (9 with the optional step) |
   | 1280×700 (a 1280×800 laptop in Chrome) | 11 | 6 | 7 |
   | 1440×900 | 16 | 8 | 10 |
   | 390×844 | 9 | 7 | **8** |
   | 412×800 and 360×780 (Android Chrome) | 8 | 6 | 7 |

   The reading pane will always cost rows. The ruling (RESULT.md 4) accepts one fewer row on the phone. The build loses two, and on desktop half of today's. A fair target is 8 at 1280×800 (three-line rows beside a pane, about 57% of a one-line list) and 8 at 390×844 (today's 9 less one). Fix 1 gets there without cutting anything.
2. **Search, top bar at 1280.** Today's search is a 720 px pill, and its width is one of today's strengths. The build's is 431 px (x 272 to 703), followed by 437 px of empty canvas before Help. Fix: let it grow to `max-width:720px` (x 272 to 992). Keep the new white fill and the `border-strong` edge.
3. **Phone conversation, open message header.** Today the header has Star, Reply and More. The build hides Reply on the phone (`.omh .acts .rp{display:none}`), so a quick reply now means scrolling to the end of the body. Fix: put the 44 px Reply back between Star and More. The row has room, with only the date and two icons in it.
4. **Open sender's address at 1024.** In the pane the address clips to `Olga Klein <olga.kl`. The full address is what Atkinson was kept for (design.md: telling lookalike senders apart). Fix: when the address doesn't fit, move it to its own line under the name, as the 390 header already does. Never clip it.
5. Not a regression, an accepted trade: the phone snippet drops from today's two lines to one. That pays for the 16/600 subject (ruling 4). Leave it.

## Priority issues

1. **Density: reach 8 and 8 with these measured levers (pixel costs from the twins).**
   - *Desktop row 80 → 72 px:* padding 8 → 6 and min-height 72. A three-line row then costs 72 (−8). A wrapped-subject row is 91, down from 95 to 97 (−4 to −6).
   - *The paperclip moves to the date line*, beside the date, as on the phone. The right stack becomes Star and Important (56 px). An attachment row then stops at 91, not the 101 that the three stacked 28 px buttons force (−10).
   - *The unread dot hangs in the gutter*, in the checkbox column's right edge. The subject and snippet lose their 14 px indent, so all three lines share the sender's left edge and the subject gains 14 px.
   - *The list goes 400 → 440 px:* the pane goes 608 → 568, and its body measure stays about 60 characters. Together with the hanging dot, `The Weekly Byte #212: small models, big caches` (326 px) and `Refund processed for order #4378` with its chip now fit on one line.

   Measured: 8 at 1280×800 (56 px to spare), 10 at 1440×900, 11 at 1920×970. Taking the merged head to 48 px and the top bar to 56 px (a 44 px search pill) gives 9 at 1280×800, measured; treat that as optional. The density ladder becomes Default 72, Comfortable 64 (4 px padding, snippet 12/16), Compact 52 (as drawn).

   - *Phone:* row padding 8 → 6 with no 80 px floor (a natural 75 px, and 99 when wrapped); list head 56 → 48 (`Inbox` at 20/28, 44 px targets still fit); top bar 64 → 56 (a 44 px search pill). Measured: 8 at 390×844. The top-bar step is the one that buys the eighth row; without it you get 7. There are only 3 px to spare, so one more wrapped subject among the first eight brings it back to 7, and that is the honest floor.

   Don't touch: the 16/600 subject, wrapping, the 64 px bottom bar, the 152 px end padding.
2. **Merged 56 px head (deviation): accept it, but draw its selection state.** It gives back 48 px against the direction's 56 + 48. With rows checked, today's toolbar holds Archive, Report spam, Delete, Mark as read and More, and Spam and Trash add their Empty action. In a 398 px head that is 40 + 40 + 5 × 40 = 280 px, so `Inbox` and the range have to give way. Draw the 1280 and 390 heads with three rows checked, and the Spam head.
3. **1280 composer over an empty pane (deviation): it hides the real case.** With the pane on by default, the composer normally floats over an open conversation, and it is 558 px wide on a 608 px pane. At 1024 it also runs 130 px into the list island (x 445 against the list's edge at 575) and covers the subjects and stars of rows 3 to 8. Fix: make the composer `min(560px, pane width − 16px)`, anchored to the pane's right edge, so the list stays readable while you write. Redraw it over the open `Saturday plans`.
4. **The list should lead (ruling 3), but the eye still lands on the pane first.** Fixations go: (1) `Saturday plans` at 24/32 700, the largest and darkest text on screen; (2) the tinted open row; (3) the unread rows. Fix: set the conversation subject at 20/28 700, the same as `Inbox`, so the bold unread rows and their dots win the second look. Keep 24/32 on the phone, where the conversation is the whole screen.
5. **Phone conversation with no top bar (deviation): accept.** It is Gmail Android's pattern, with the action bar as the app bar and search one Back away, and the seven actions are 44 px each. What it owes is the Reply in regression 3.
6. **The 768 renders end in a blank band.** The phone frame is a fixed 844 px, so a 768×1024 render shows 180 px of white under the bottom bar. Size the phone frame to the viewport before the owner sees 768.

## Strengths to keep

- **Two islands** on the limestone canvas, with the labelled navigation (nested Work then Clients, counts, bold Spam) left on the canvas. Chrome and mail never blur, in either theme.
- **Three cues for new mail:** the patina dot, bold weight and the white-against-`row-read` tone. An open row is read, drops the dot and joins the pane through its tint and accent bar.
- **Subjects whole.** Today's phone cuts `Cancelled: Sprint retro, Fri 30 Oct 2026 …`; here it wraps, with the subject as the dominant 16/600 line.
- **One row design** shared by phone and desktop. The phone's `Inbox` head, its labelled bottom bar, and Compose clear of the last row (the scrolled state proves it). The phone's collapsed messages keep a snippet line, where today's lose it, and "to me" no longer wraps loose.

## Heuristics (0-4), total 29/40

1. Visibility of system status, 3: the dot, the joined open row, the range, and the loading, offline and send-failed states are all drawn. The selection state is missing.
2. Match with the real world, 4: Gmail's arrangement in the glossary's words (label, never folder).
3. User control and freedom, 3: Back is one tap; Discard confirms, with Cancel focused first.
4. Consistency and standards, 3: one row everywhere, but Reply is in the 1280 header and not in the 390 one.
5. Error prevention, 3: the discard confirm, and a draft is kept when sending fails.
6. Recognition rather than recall, 3: the reader's toolbar is icon-only with names and tooltips; the bottom bar is labelled.
7. Flexibility and efficiency, 2: the keyboard model and densities are kept, but a first screen of 7 rows against 14 slows triage. Fix 1 lifts it.
8. Aesthetic and minimalist design, 3: calm and grouped. The pane subject outranks the list.
9. Error recovery, 3: Try again everywhere, and "It's saved in Drafts".
10. Help and documentation, 2: Help is in the 1280 top bar and nowhere on the phone, as today.

## Dark and phone

- **Dark** is a designed theme, not an inversion. The islands are `#1d2421` on `#0d110f` with an edge doing the shadow's job, the patina is lighter with dark text on it, and the selected row is a deep green that still reads as the join. It fixes today's 1.10 panel step.
- **The phone** is a real phone design: one column, 44 px targets, a bottom bar plus Compose in thumb reach. Its cost is 184 px of chrome (64 + 56 + 64), 22% of 844, against today's 112. Fix 1 brings that to 168.

## Detector

Run on all 9 twins with the parser packages (presentation-sites' `node_modules`), not degraded.

- **Dismissed:**
  - `cramped-padding` (36 per list twin): the unread dot (an 8 px fill with no children), islands whose rows run edge to edge on purpose, the search pill, and the list head's hairline.
  - `side-tab` on `.row.sel`: the 3 px accent bar is the one RESULT.md ruling 3 keeps to tie the row to the pane. The ruling overrides the detector.
  - `nested-cards` (4): the Direction sheet's specimens.
  - `gpt-thin-border-wide-shadow`: the floating composer needs that elevation.
  - `flat-type-hierarchy` (12 to 20, 1.7:1): right for app UI.
  - `em-dash-overuse` (64) on the Direction sheet: these are the token names (`--color-surface`); the page has no em dashes.
- **Real findings:** none.

**Clashes with the rulings:**
- `side-tab` (above): the ruling wins.
- Ruling 4 says "one fewer row". The build drops two at 390×844, and fix 1 restores the ruling.
- Ruling 1, "no ellipsis": the build fades snippets instead of ending them in an ellipsis. That is consistent with the ruling, and with the 440 px list `Thursday at 7? Sam` no longer loses its last word.

Don't dilute while fixing: whole subjects, the two islands on the canvas, and the joined open row. Density comes from padding, the paperclip's place, the dot's place and the list width, never from cutting a word.
