# postern: two directions

Written 2026-11-12 by the art director. Repo: postern, brief 04. Both directions keep the recorded decisions: Gmail's arrangement in Postern's own face, never Google's colours, logo or wordmark (decisions.md, "Our own webmail, shaped like Gmail"; design.md). They keep the three layouts (wide, rail, phone), the floating composer, the keyboard model, the sandboxed message frame and its own CSS, no inbox category tabs (decisions-mail.md), Light / Dark / System with light on a first visit, the three densities, and the token names in `web/src/styles/index.css` (`canvas`, `surface`, `surface-raised`, `surface-sunken`, `row`, `row-read`, `row-selected`, `accent-soft`, `star`, `inverse`). The words are the glossary's: label, never folder or tag.

Faces and accent: Atkinson Hyperlegible Next with its Mono, and the patina green, are today's, so the registry allows them even though the-board also sets Atkinson. design.md records why Atkinson stays: its l, I and 1 differ, and so do 0 and O, which is what spotting a lookalike sender address needs. Both directions keep it. The patina stays a green near hue 165 and must not drift toward shelfmark's teal `#0a6b84`. Taken elsewhere: Literata, Public Sans, Rethink Sans, Bricolage Grotesque, Hanken Grotesk, Newsreader, Archivo, Sofia Sans, Schibsted Grotesk, Azeret Mono; and teal, clay, amber, moss, both blues, cobalt and neutral ink.

## 1. Today's strengths (keep all of them)

1. Islands. The mail sits on a white panel with 16 px corners, set on the limestone canvas, while the top bar and navigation stay on the canvas. Chrome and content never blur.
2. Everything is in plain view at 1280: the mark, a wide search with its options button, Help, Settings and the account. Compose is the one solid button, at the head of the navigation.
3. Navigation reads at a glance. The selected label is an inset rounded rectangle in `accent-soft`, counts sit right-aligned, Spam goes bold when it holds unread mail, and Labels nest with a chevron (Work, then Clients).
4. Unread rows are bold: the sender, the subject and the date, as in Gmail. Partial senders keep their mix ("me, **Bob** (2)").
5. The row anatomy is complete and familiar. Checkbox, star, important, senders with the count, label chips, subject and snippet, a paperclip, the date. At 390 the same row becomes three lines with the star on the right.
6. The red `Draft` in a sender list and the brass stars give the list two quiet points of colour.

Faults both directions fix:
- Read and unread rows barely differ in tone: `row-read` on `row` is 1.07 in light and 1.04 in dark.
- Dark `surface` on `canvas` is 1.10. The Floor needs 1.15.
- At 390 nothing names the label you are in. The top bar holds the menu, the search, Settings and the account, and no `Inbox`.
- At 390 the Compose button covers the date and star of the tenth row, and the list has no end padding.
- Subject and snippet are joined by an en dash, close to Floor 10's joined strings. Both directions drop it and let the snippet's colour and a gap do the work.
- The `Receipts` and `Work` chips sit on a grey that disappears on read rows.
- The brass star on a read row is 4.05 in light. Fine for an icon, but never put text in it.

## 2. The main screen

The Inbox list with its shell, route `#inbox`, in `board/shots-existing/postern-03/`:
- **1280:** `after-light-1280-list.png`, dark `after-dark-1280-list.png`.
- **390:** `after-light-390-list.png`, dark `after-dark-390-list.png`. The drawer state: `after-light-390-drawer.png`.

All are 1280×900 or 390×900 viewports. B's reading pane takes its copy from `after-light-1280-conversation.png`, the same seeded mailbox. The seed is demo mail (Alice Archer, `alice@postern.test`), never the owner's real mailbox.

## 3. The content fixture (word for word from the shots)

- **Top bar.** `Main menu` button; the mark and `Postern` (link `Postern, go to Inbox`); search placeholder `Search mail` with the search options button; `Help`, `Settings`; the account avatar `A`.
- **Navigation.** `Compose`. Then `Inbox` 129 (selected), `Starred`, `Snoozed`, `Sent`, `Drafts` 2, `Scheduled`, `Spam` 3 (bold), `Trash`, `All Mail`. Head `Labels`: `Hostile` 5, `Receipts` 15, `Travel` 5, `Work` 14 (open, chevron), `Clients` 1 nested under Work. At the foot: `Contacts`. Lucide icons as today: Inbox, Star, Clock, Send, File, CalendarClock, ShieldAlert, Trash2, Mails, Tag, Users.
- **Toolbar.** `Select all` checkbox, `Select` menu chevron, `Refresh`; on the right `1–17 of 2,038`.
- **Rows.** Exactly these 16, in this order. Bold means unread, so rows 1 and 8 are read. Snippets truncate at the row's end; don't extend a snippet past what is written here.
  1. `Olga, me (4)`, `Re: Saturday plans`, `Hello Alice, The kids say hello. I found the book you mentioned in a second-hand shop.`, `Oct 2`, read.
  2. `Sam Rivera`, `Climbing on Thursday?`, `The wall has a new set of routes. Thursday at 7? Sam`, `Oct 1`.
  3. `Corner Shop`, chip `Receipts`, `Your bill for this month`, `Hello Alice, The total includes VAT. The total includes VAT. Questions? Reply to this email…`, `Sep 30`.
  4. `Zoë Müller`, `Café-Treffen am Samstag? ☕`, `Hallo Alice, hast du am Samstag Zeit für einen Kaffee? Ich kenne ein schönes Café a…`, `Sep 30`. The cup is mail data and stays.
  5. `Bob Baker`, `Cancelled: Sprint retro, Fri 30 Oct 2026 14:00 (UTC)`, `Sprint retro on Friday 30 October is cancelled: we'll fold it into Q1 planning.`, paperclip, `Sep 30`.
  6. `Bob Baker`, `Invitation: Q1 planning, Thu 5 Nov 2026 10:00 (Lisbon)`, `Q1 planning Thursday 5 November 2026, 10:00 to 11:30 (Lisbon) Room 2, third floor…`, paperclip, `Sep 30`.
  7. `The Weekly Byte`, `The Weekly Byte #212: small models, big caches`, `Small models, big caches * Why your cache hit rate lies to you…`, `Sep 30`.
  8. `Corner Shop`, chip `Receipts`, `Refund processed for order #4378`, `Hello Alice, Keep this email for your records. Thank you for your order. Your items are on…`, `Sep 30`, read.
  9. `Calendar`, `Build #4641 passed`, `Hello Alice, No action is needed. No action is needed. This is an automated message…`, `Sep 29`.
  10. `Luca Novak`, chip `Work`, `Hiring update`, `Hello Alice, I have updated the timeline accordingly. Two open q…`, `Sep 29`.
  11. `me, Bob (2)` with only Bob bold, `Re: Lunch tomorrow?`, `Yes please. 12:30? On Tue, 29 Sep 2026 11:20 UTC, Alice Archer …`, `Sep 29`.
  12. `Carol … Dave, Draft (15)` with `Draft` in `danger`, starred, chip `Work`, `Re: Q4 roadmap review`, `Thanks everyone. The final roadmap is on the calenda…`, `Sep 29`.
  13. `Pavel, me (2)` with Pavel bold, `Workshop follow-up`, `Hello Alice, Let us keep the scope as agreed. I have updated the ti…`, `Sep 28`.
  14. `Priya Raman`, `Invitation: Book club dinner, Fri 6 Nov 2026 19:00 (UTC)`, `Book club dinner Friday 6 …`, paperclip, `Sep 28`.
  15. `Hamid Jensen`, starred, `Quarterly numbers`, `Hello Alice, Following up on our conversation. Following up on our c…`, `Sep 28`.
  16. `Corner Shop`, chip `Receipts`, `Your order #7777 has shipped`, `Hello Alice, Thank you for your order. Keep t…`, `Sep 28`.

  Row 17 is below the fold in the shot. Don't invent it; let the list run off the frame. At 390 the shot shows rows 1 to 10.
- **Row controls** and their names: `Select`; `Not starred` or `Starred`; `Not important` or `Important`. At 390, `Compose` floats bottom-right. Today's 390 row shows no chips and no Important marker; keep it that way at 390.
- **B's reading pane only** (row 1 open, from the conversation shot). Toolbar: `Back to Inbox`, `Archive`, `Report spam`, `Delete`, `Mark as unread`, `Move to`, `Labels` (the code draws the back button with the pane on too). Subject `Saturday plans`. Three collapsed messages:
  - `Olga Klein` `olga.klein@mail.example.com`, `Hello Alice, We should do this more often. Bring a jumper, it gets cold by the river. I found…`, `Sep 30, 6:00 PM`;
  - `Alice Archer` `alice@postern.test`, `Hi Olga, It has been far too long. Are you free at the weekend? The kids say hello. The kids …`, `Oct 1, 2:00 PM`;
  - `Alice Archer` `alice@postern.test`, `Hi Olga, I found the book you mentioned in a second-hand shop. Are you free at the weeke…`, `Oct 2, 9:00 AM`.

  Then the open message: `Olga Klein` `<olga.klein@mail.example.com>`, `to me`, `Oct 2, 12:00 PM`, `Star this message`, `Reply`, `More`. Body, in the frame, plain: `Hello Alice,` / `The kids say hello. I found the book you mentioned in a second-hand shop.` / `It has been far too long. We should do this more often.` / `I am still laughing about last time. Hope you are well. I found the book you mentioned in a second-hand shop.` / `I am still laughing about last time. Let me know what suits you.` / `Olga`. Buttons `Reply`, `Reply all`, `Forward`.

  This is the one fixture difference, on purpose: an empty pane can't show whether the split works. The empty pane `No conversation selected` (MainArea's copy) goes in the States strip.
- **States strip, both directions.** Empty label `No conversations in Spam`. Connection lost: `Can't reach the mail server` with `Try again`. Labels failed: `Your labels didn't load`, `Something went wrong on the way. Try again in a moment.` Loading: skeleton rows at the row height, static, no shimmer.

## 4. Directions

### A. Patina, settled (Evolve today)
- **Idea:** today's Gmail arrangement, with read and unread you can tell apart by tone, a panel that lifts in dark, and a phone list that says where you are.
- **Skeleton:** today's.
  - **1280.** The canvas holds a 64 px top bar and a 256 px navigation. The main panel is one `surface` island, radius 16, with a 1 px `border` edge and `shadow-sm` in light. Its 48 px toolbar row ends on a `border` hairline. Rows are one line at 48 px (default density), with the same columns as today. The snippet is `text-muted` 14 after a 12 px gap, no dash. Unread rows are `row` (white) with 700 sender, subject and date. Read rows are `row-read`, a step down to 1.10, at 400 weight. Chips get a 1 px `border` edge on `surface-sunken`. Compose is a solid patina button, 48 px tall, radius 12, pencil icon plus the word.
  - **390.** Today's top bar and drawer. The toolbar row gains the label's name: `Select all`, the chevron, `Inbox` at 16/24 700, then `Refresh` on the right. Rows stay three lines with the star on the right, 48 px targets. Compose is a solid patina extended button, 56 px tall. The list ends with 88 px of padding so row 10's date and star clear it.
  - **Densities:** rows 48 / 40 / 32 at 1280; 80 px three-line rows at 390.
- **Type:** Atkinson Hyperlegible Next 400/500/700 (Google `family=Atkinson+Hyperlegible+Next:wght@400;500;700`), Mono for keys only. Five sizes: 12/16 counts and chips (tabular figures); 14/20 UI, rows and nav; 16/24 body, inputs, the 390 rows' subject; 20/28 the wordmark at 700; 24/32 page titles.
- **Palette** (light / dark), today's roles, retuned:
  - Surfaces: canvas `#edf0ec` / `#0f1311`; surface and row `#ffffff` / `#1c2320`; row-read `#f3f5f2` / `#121815`; surface-raised `#ffffff` / `#242c28`; surface-sunken `#e6eae5` / `#141916`.
  - Text: text `#18201c` / `#e3e9e5`; text-muted `#4e5853` / `#aab5af`; text-subtle `#5d6862` / `#9aa59f`.
  - Lines: border `#c9d1cb` / `#3a4540`; border-strong `#7d8882` / `#76827b`.
  - Accent: accent `#1c6a57` / `#72cbae`; on-accent `#ffffff` / `#062a20`; accent-soft `#d5ebe2` / `#1d3b32`; on-accent-soft `#0e4537` / `#b4ead7`. Star `#a86a00` / `#e9b949`, danger `#a8352b` / `#f2998d`.
  - Pre-checked (light / dark): surface on canvas 1.15 / 1.17; row-read against row 1.10 / 1.12; border on surface 1.56 / 1.61; surface-raised against surface 1.00 (edge and shadow) / 1.12 (edge); text on canvas 14.5 / 15.2; text-muted on row-read 6.7 / 8.5; text-subtle on row-read 5.3 / 7.1; accent on canvas 5.6 / 9.7. Re-run `contrast.mjs`.
- **Signature:** the two-tone list. Unread rows stand white and bold, read rows sink one step and go regular, so a scan finds new mail by tone and weight, never by a dot. In dark the step is 1.12, so weight carries more of it there.
- **Reference:** `stripe`, for dense rows on a white sheet over a tinted ground with one hairline weight. Nothing of its palette.
- **Reopens:** nothing recorded. design.md's palette table and the read-row value change.

### B. The reading desk
- **Idea:** list and conversation side by side as two islands, the reading pane on by default, the open row joined to its conversation, and a phone with its labels in a bottom bar.
- **Skeleton:**
  - **1280.** Top bar and a 240 px labelled navigation on the canvas, as today, with the full tree and counts. Then two `surface` islands, radius 16, 8 px apart. The list island is 400 px. Its head is `Inbox` at 20/28 700 with `1–17 of 2,038` under it, then the toolbar. Rows are three lines beside the checkbox: sender and date; subject with its chips; snippet in `text-muted`. The star, Important and the paperclip stack in a right column. It is the phone row with the desktop's extras, so the two widths share one design. The pane island is the rest, about 600 px. Its head band is `accent-soft`, holding the conversation toolbar and `Saturday plans` at 24/32. Under it, the collapsed messages stack sender, address and date on one line with the snippet under it, then the open message, the body frame and the reply buttons.
  - **The join.** The selected row's fill is `accent-soft` and runs flush to the list island's right edge, with no inset or radius on that side. The pane's head band is the same `accent-soft`, so the eye joins them across the 8 px gutter at any row and any scroll position. It is a shared colour, not a painted bridge: the list scrolls in its own box.
  - **Not satchel.** Satchel has a 72 px icon rail, a 340 px list and a thread. B keeps a 240 px labelled navigation with nested labels and counts, and its rows carry checkboxes and bulk actions.
  - **390.** The top bar holds the search pill, `Settings` and the account; `Main menu` goes, since `Labels` opens the same drawer. Under it, `Inbox` at 24/32 with the toolbar on the same row. Rows are three lines, 80 px, as today, and swipe stays. A 64 px bottom bar, plus the gesture inset, holds `Inbox`, `Starred`, `Sent` and `Labels`; `Labels` opens today's drawer with the whole tree, Contacts and Settings. Compose floats right, 16 px above the bar, and the list pads by both heights. The pane stays off on phones, as the code does today.
  - **Densities:** rows 80 / 72 / 52 at 1280. Compact drops the snippet line. Fixed heights, so the virtual list still works.
- **Type:** the same faces. Six sizes: 12/16 counts, dates and chips (tabular); 13/18 snippets and addresses; 14/20 UI, sender and subject; 16/24 body and inputs; 20/28 the list head and wordmark; 24/32 the conversation subject and the 390 head.
- **Palette** (light / dark). A deeper ground so two islands stand off it:
  - Surfaces: canvas `#e8ebe7` / `#0d110f`; surface and row `#ffffff` / `#1d2421`; row-read `#f4f6f3` / `#171d1a`; surface-raised `#ffffff` / `#262e2a`; surface-sunken `#e1e5e0` / `#121714`.
  - Text, lines and accent as A, except border `#c4ccc6` / `#3b4641` and accent-soft `#d5ebe2` / `#1f3d33`.
  - Pre-checked (light / dark): surface on canvas 1.20 / 1.20; border on surface 1.64 / 1.61; surface-raised against surface 1.00 / 1.14, both with edges; row-read against row 1.09 / 1.08; accent-soft against surface 1.25 / 1.34; on-accent-soft on accent-soft 8.7 / 8.9; text-muted on accent-soft 5.9 / 5.6; accent on accent-soft 5.2 / 6.1; border-strong on surface 3.7 / 4.0. Re-run `contrast.mjs`.
- **Signature:** the join. The selected row and the open conversation share one `accent-soft` band across the gutter, so you always see which row you are reading.
- **Reference:** `linear.app`, for a list and a detail as two inset panels side by side. Nothing of its palette or type.
- **Reopens** (flag each on the board):
  - The reading pane default goes from `none` to `right` (`displaySettings.ts`). `none` and `below` stay as settings, so this is a default, not a new mode.
  - The 1280 row becomes three lines and the density heights change. design.md's density table changes.
  - The phone: a bottom bar where design.md says the navigation "is hidden until the menu opens it". The drawer stays for the whole tree, behind `Labels`, and the menu button leaves the top bar.

## 5. Registry lines

| postern (A) | Patina, settled | Atkinson Hyperlegible Next (today's) | Atkinson Hyperlegible Next (today's) + Mono for keys | patina green (today's) | Gmail's shell: top bar, 256 px nav on the canvas, one raised mail panel with one-line rows; read rows a tone down; phone drawer and a floating Compose |
| postern (B) | The reading desk | Atkinson Hyperlegible Next (today's) | Atkinson Hyperlegible Next (today's) + Mono for keys | patina green (today's) | top bar, 240 px labelled nav, a 400 px list island of three-line rows beside a reading-pane island, the selected row joined to the pane's head band; phone bottom bar Inbox, Starred, Sent, Labels with Compose above it |

## 6. Questions for the owner (ask sticky)

1. B turns the reading pane on by default and gives the phone a bottom bar. Both move recorded layout. Is that on the table, or does Postern stay Gmail's full-width list?
2. Approve this direction?
3. Today's rows show an `Important` marker beside the star. Keep it in both, or drop it from B's 400 px row to give the subject room?
