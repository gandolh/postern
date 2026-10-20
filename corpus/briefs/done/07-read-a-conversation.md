# Task 07: Reading a conversation

## Context

Opening a row shows the whole conversation, Gmail-style. Every message body is
hostile until proven otherwise. The rendering rules in
[security.md](../../wiki/security.md) are hard rules here, not polish.

## Files you OWN

- `web/src/conversation/**`: the conversation view, message cards, header
  details, quoted-text folding
- `web/src/render/**`: the sanitiser config, `srcdoc` building,
  remote-content blocking and restoring, link handling
- `web/src/attachments/**`: attachment chips, download, preview

## What to do

1. **The view.**
   - The subject with label chips.
   - Messages collapsed to one line except the unread ones and the last.
   - "N older messages" folds a long conversation.
   - Open as full width, or in the reading pane (setting in brief 12; default
     full width).
2. **Each message card.**
   - Sender name *and* address, recipients, date.
   - A details dropdown: from, to, cc, date, mailed-by, signed-by, from
     Stalwart's authentication results.
   - Reply, reply all, forward (brief 08 wires them).
   - A menu: mark unread from here, delete this message, report spam, show
     original.
3. **Bodies.**
   - The HTML part is sanitised and goes into a `<iframe sandbox>` through
     `srcdoc`: no `allow-scripts`, no `allow-same-origin`.
   - The frame sizes to its content (a fixed-height measure from the sanitised
     DOM, since the frame cannot script).
   - Plain-text bodies are escaped and linkified.
   - `cid:` images resolve through blob URLs.
4. **Remote content** is blocked by default, behind a "Images are not displayed
   — Display images below / Always display images from <sender>" bar. The
   per-sender allowance is a per-device list for now (see open questions).
5. **Quoted text** collapses behind "…", as in Gmail.
6. **Attachments.**
   - Chips with name, type and size.
   - Download through the blob URL with `Content-Disposition: attachment`.
   - Preview images and PDFs in a sandboxed viewer.
   - Never render HTML attachments.
7. **Mark as read** on open (`$seen`), and keep it read after the next refresh.

## Acceptance

- Every message in the hostile seed set renders without running script, without
  loading a remote resource before "Display images", and without escaping its
  frame (checked in the browser).
- Long conversations from the seed open correctly. Quoted text folds; inline
  images show.
- Attachments download with the right names. Images and PDFs preview.
- No code path inserts message HTML into the app's own DOM (code review plus a
  grep for `dangerouslySetInnerHTML`).

## Outcome (2026-10-20)

Built. All 17 hostile fixtures render in Chrome without running script,
without a remote request before "Display images", and without leaving their
frame; every frame's sandbox is exactly the two allowed tokens. Long
conversations fold ("11 older messages"), quotes fold behind "…", inline
`cid:` images show as `data:` URLs, and attachments download under their real
names. Choices and gaps are in [security.md](../../wiki/security.md)
("Message rendering as built"): estimated frame height, PDFs in a new tab,
content dropped on purpose, and the image allowance trusting a forgeable From.
Mark-read on open sends its own change, so it never replaces the user's last
undo. The grep finds only two `outerHTML` reads that serialise DOMPurify's
detached document.
