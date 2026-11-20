# The redesign: "The reading desk"

This folder is the design record of Postern's redesign. The estate redesign board, where it was drawn and approved, is a private canvas; this is a copy of the app's page on it plus the build behind that page. The owner approved it on 2026-11-13, and [brief 04](../../corpus/briefs/done/04-a-redesign-with-hallmark-on-the-estate-board.md) built it. The code is now the source of truth: where the app and these files differ, the app wins, and later work may have moved a screen on. Read this folder to see what was decided and why before reshaping a screen.

## The owner's decisions

The owner approved the whole board on 2026-11-13, with every question standing at what the board proposed unless they reopened it. The questions this app's page asked:

- **Ask:** 1. Reopened: the reading pane goes on by default (the default `none` becomes `right`) and the phone gets a bottom bar with Inbox, Starred, Sent and Labels, where design.md says the navigation is "hidden until the menu opens it". Is that on the table, or does Postern stay Gmail's full-width list? 2. Today's rows show an Important marker beside the star. Keep it in the 1280 row (as drawn), or drop it to give the subject room? The 390 row has none today and none here. 3. Approve The reading desk as Postern's direction?
- **Open question:** The app pulses its loading skeleton today; this sheet draws it still, as research prefers. Keep it still? The composer's send-failed and sending toasts are today's strings; the other states are the app's own copy.
- **Reopened:** Recorded (design.md, Reading pane): "none, right, below", with `none` the default; and under Layouts: "under 600 px it is hidden until the menu opens it" (the navigation). Proposed: the pane defaults to `right` at 1280 and stays off on phones, as the code does today; `none` and `below` stay as settings. The phone gets a bottom bar, and the drawer opens from its Labels tab with the whole tree, so the top bar drops the menu button.
- **Reopened:** Recorded (design.md, Densities): rows 48, 40 and 32 px, with a row of one line. Proposed: three-line rows of 72 px with 6 px padding (comfortable 64 with a 12/16 snippet, compact 52 with no snippet line), so the list and the phone share one row; the phone row has no height floor (about 75 px). A subject that wraps to two lines grows the row to about 91 px, which the virtual list must measure; the list is 440 px, the top bar 56 and the list head 48.

Where the files below disagree, the later layer wins: the owner's decisions, then the controller's rulings, then the judges' rulings, then the directions file.

## What is here

| Path | What it holds |
|---|---|
| `directions/postern.md` | The director's brief: both directions (the winner is the one built), the shared fixture and the screens to draw. |
| `judge/postern/RESULT.md` | The blind judging against today and the rulings that came with the win. |
| `critiques/postern-controller.md`, `critiques/postern.md` | The design critic's review against today, and the controller's rulings over it. |
| `manifests/postern.tokens.css`, `manifests/postern.tokens-map.md` | The token hand-off in the app's own names, and the renamed, new and unused tokens. |
| `manifests/postern.board-notes.md` | What the board said beside the screens: the asks, decisions, reopened rules, open questions, the contrast table and the runner-up. |
| `work/postern/twins/*.html` | Each drawn screen as static HTML, light and dark: open one in a browser. |
| `work/postern/shots/` | The twins rendered at 1280 and 390, light and dark, WebP. `direction.webp` is the board's direction sheet. |
| `shots/postern/` | Today's screens as the board showed them before the redesign. |

People's names and data in the pictures come from seeded demo accounts or are invented.

## Not here

The sketches and the judges' images, the runner-up's build (its notes are in the board's notes), the build's scripts, and the screenshots taken while it was built. They stay in the estate build folder.
