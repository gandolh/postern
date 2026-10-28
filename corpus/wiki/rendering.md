---
summary: How a message body is rendered, as built in brief 07 and hardened since (2026-10-20): DOMPurify in a detached document, the srcdoc frame and its exact sandbox flags, its own CSP and no-referrer, what is dropped on purpose (SVG, MathML, media, forms, remote fonts, fixed positioning), inline images as data: URLs, the estimated frame height, image and PDF previews, the review's hardening (CSS escapes, bidi, size budgets), and brief 17's look-alike hosts, DMARC-gated "always display images" and linear-time scanning. The rules behind it are in security.md.
updated: 2026-10-28
---

# Message rendering as built

Moved here from [security.md](security.md) on 2026-10-28, unchanged but for
its heading. The rule it serves: message HTML renders only in the sandbox
([security.md](security.md)).

## Brief 07 (2026-10-20) and after

- **Sanitiser:** DOMPurify 3.4.16 in a detached document
  (`web/src/render/sanitize.ts`), then a `srcdoc` frame with exactly
  `sandbox="allow-popups allow-popups-to-escape-sandbox"`. Each frame also
  carries its own CSP and `no-referrer`, as a second layer.
- **Dropped on purpose:** inline SVG and MathML, audio and video, forms and
  every form control, remote fonts and `@import` (even after "Display
  images"). `position: fixed`, `absolute` and `sticky` become `static`, which
  can flatten a newsletter's layout. A message with its own `<style>` stays on
  a light background in dark mode.
- **Inline images** are `data:` URLs. A `blob:` URL made by the app shows as a
  broken image inside the opaque-origin frame (tested in Chrome).
- **Frame height** cannot be measured, because the frame cannot script and
  the app cannot read it. It is estimated from the sanitised document, capped
  at 1.5 times the viewport, and scrolls inside past that, with "Show full
  message" to lift the cap.
- **PDF preview** opens in a new tab with no opener, after checking the bytes
  start with `%PDF-`. Chrome refuses a PDF in any sandboxed frame. Images
  preview in a `sandbox=""` frame and are typed by their bytes.
- **Hardening after review (2026-10-20):** CSS escapes are decoded to a fixed
  point and leftover backslashes dropped, so a double-escaped `url()` or
  `@import` cannot slip through. Names, addresses and file names sit in
  `<bdi>`, and bidi control characters are stripped from attachment names for
  display, checks and saving. The in-frame link pill carries an inline
  `!important` style, and message markup loses any `postern*` class or id.
  Image previews stop at 20 MB; inline images load up to 8 MB each and 16 MB
  per message on open, the rest on request.
- **Brief 17 (2026-10-20):**
  - Look-alike hosts are decided in `web/src/render/idn.ts`: a label that
    mixes scripts (Japanese, Chinese and Korean mixes with Latin allowed),
    one whose letters all imitate Latin under a TLD of another script, or a
    Latin letter made to pass for another. münchen.de and почта.test are not
    flagged; аpple.test and аррӏе.test are.
  - "Always display images from <sender>" applies only when the topmost
    Authentication-Results (Stalwart's own) says `dmarc=pass` for the
    sender's domain. Stalwart keeps a sender-written header with its own
    name underneath its result, so only the topmost one counts. The global
    "always display" setting is unchanged.
  - Every frame turns DNS prefetching off, so no link's host is resolved
    before a click.
  - Plain-text bodies, quotes and display names are scanned in linear time;
    before, one hostile message could freeze the tab
    ([security-findings.md](security-findings.md), F2).
