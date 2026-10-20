---
summary: Every security finding from brief 17's whole-repo review (2026-10-20), by severity, with file and line, what an attacker gets, and whether it was fixed (with its test) or is open and whose lane the fix belongs in. The open High one is the service worker's precache, which any script on the shared origin can rewrite. Read before working on the service worker, push, prefs, filters or anything the shared origin can reach, and when picking security follow-ups.
updated: 2026-10-20
---

# Security findings (brief 17)

The review covered `jmap/src/**` and `web/src/**`, beyond the two reviews of
rendering and sign-in. Threat model and rules: [security.md](security.md);
headers: [security-headers.md](security-headers.md). "Same-origin script"
means a script running in any estate app on the shared origin
([decisions.md](decisions.md)). Line numbers are as of 2026-10-20.

## Open

### F1 · High · A same-origin script can replace what the worker serves as Postern

- **Where:** [web/src/sw/sw.ts](../../web/src/sw/sw.ts) lines 43 and 46-51
  (`precacheAndRoute`, and navigations answered with the cached
  `index.html`). workbox-precaching 7.4.1's `PrecacheStrategy` serves the
  cache match with no integrity check.
- **Attack:** Cache Storage belongs to the whole origin, and the cache name
  (`workbox-precache-v2-<scope>`) is predictable. A script on `/other/`
  `put`s its own `index.html` (or a JS chunk) into Postern's precache. The
  worker then serves it as Postern on every later visit, with no CSP, because
  the forged response has no headers.
- **Gets:** a lasting foothold inside Postern that sees the password and TOTP
  code at the next sign-in. It outlives the original bug, a password change
  and a deploy that leaves that file's revision alone. This is more than the
  accepted shared-origin cost, which lasts only while the injected script
  runs.
- **Proven:** `tokens.spec.ts` replaces the cached `index.html` from
  `/probe/`, and the next load runs it. The test is marked as an expected
  failure, so it flips when fixed.
- **Fix (web/src/sw, brief 16's lane; Caddy cannot help):**
  - either check each precached response against a SHA-256 baked into
    `sw.js` (the browser fetches the worker script from the network, never
    from Cache Storage) and fall back to the network on a mismatch;
  - or stop precaching (a push-only worker), and delete every
    `workbox-precache-*` cache on activate. Offline only ever showed the
    sign-in page. Check that installability survives without a fetch
    handler.

### F6 · Low · Security-relevant preferences live where any same-origin script can write

- **Where:** `postern.prefs.<user>` `{"images":"always"}`
  ([web/src/prefs/prefs.ts](../../web/src/prefs/prefs.ts) lines 70-85, read
  and applied as the global setting) makes every sender's images load; `postern.images.<user>` adds senders
  (though brief 17's DMARC gate now limits those);
  `postern.webPush.<user>` `{"on":true}`
  ([web/src/push/webPush.ts](../../web/src/push/webPush.ts) lines 186-199)
  subscribes at the next sign-in when permission is already granted; swipe
  actions; `defaultIdentityId`.
- **Gets:** tracking pixels and the reader's IP on every open; notifications
  with sender and subject while Postern is closed.
- **Fix:** none complete while these live in localStorage (owner decision
  2026-10-20). Show a lasting indicator while "always display images" or Web
  Push is on, and confirm those values once per sign-in.

### F7 · Low · Any same-origin page can make the worker take over, which reloads and signs out

- **Where:** [web/src/sw/sw.ts](../../web/src/sw/sw.ts) lines 37-39 accept
  `SKIP_WAITING` from any client, while an update is waiting.
- **Fix:** act only when `event.source` is a window client under the scope.

### F8 · Low · The page takes worker messages from any worker

- **Where:** [web/src/push/register.ts](../../web/src/push/register.ts) lines
  47-61 (`handleWorkerMessage`) and 72 (the listener) never check
  `event.source`. A worker another estate app
  registers at its own scope can reach Postern's tab: fake Web Push
  verification codes (turning push on fails), or learn from `WILL_NOTIFY`
  whether the user is signed in. Not tried in a browser.
- **Fix:** require `event.source` to be the worker whose `scriptURL` is
  `/webmail/sw.js`.

### F9 · Low · "Also apply to matching conversations" can search for something else

- **Where:** [web/src/filters/retroactive.ts](../../web/src/filters/retroactive.ts)
  line 20 (`criteriaToSearch`) passes "Has the words" through as search
  syntax, since `joinWords` (`jmap/src/sieve/model.ts` line 124) quotes only
  words with a space in them: `-foo` becomes NOT, `OR` and `AND` vanish. A filter whose words are just `OR` matches all
  mail outside Spam and Trash, and a Delete action then hits up to 5,000
  conversations (undoable). The user types the words, hence Low.
- **Fix:** quote each word in `criteriaToSearch`, and show the count first.

### F4b · Low · The DMARC gate trusts the topmost Authentication-Results

- Brief 17 made "Always display images from <sender>" apply only to mail
  whose topmost header says `dmarc=pass` (fixed below). A dev probe on
  2026-10-20 showed Stalwart 0.16.25 prepends its own result
  (`dmarc=fail (policy not aligned)` for a forged sender) but keeps a
  sender-written header claiming its own authserv-id underneath. So reading
  only the topmost header is what defeats the forgery.
- **Residual:** mail that skips Stalwart's inbound checks (authenticated
  submission by another local account) could carry a forged topmost header.
- **UX follow-up (conversation lane):** the "Always display images from …"
  button still shows on mail that did not pass DMARC. The list then does not
  apply to that sender's next unauthenticated message. Hide the button there,
  or say why.

### Info

- **The sanitisers' parse documents inherit the app's CSP.** A message's
  `<base>` logs one refused `base-uri` violation; harmless.
- **Notifications show only the display name**
  ([web/src/notify/show.ts](../../web/src/notify/show.ts) line 45), so a
  spoofed name has no address beside it. Consider the domain.
- **Data left after sign-out, readable by any same-origin script:**
  `postern.prefs.lastAccount` (the username), `postern.images.<user>`, and
  the per-account key names. The probe page in `tokens.spec.ts` sees them,
  and sees the worker's registration.
- **`__proto__` as a label id**
  ([web/src/labels/labelPrefs.ts](../../web/src/labels/labelPrefs.ts) line 57)
  only resets a local object's prototype. Use `Object.create(null)` or a Map.
- **Cross-window drag:** a drop carrying Postern's custom type from any window
  is accepted ([web/src/labels/useLabelDropTarget.ts](../../web/src/labels/useLabelDropTarget.ts)
  lines 46-51). Whether browsers pass custom types across origins is
  unconfirmed. A per-page nonce in the drag data would settle it.
- **Input inside a message frame is not activity.** The sandboxed frame's
  events do not reach the app, so scrolling one long message for 8 hours
  without touching Postern signs out. Accepted.
- **No revocation:** a token copied before sign-out keeps working until it
  expires. `tokens.spec.ts` asserts this, so a Stalwart that gains
  revocation shows up.

## Fixed in brief 17 (each with a test)

- **F2 · Medium · One hostile plain-text message could freeze the tab.** These
  patterns rescanned a long run from every position, or trimmed one character
  at a time, over bodies up to 1 MB (8.6 s for 40k brackets, minutes at 1 MB):
  - [web/src/render/linkify.ts](../../web/src/render/linkify.ts): the address
    pattern now starts only at a run's start, with RFC 5321 bounds, and
    `trimTrailing` works in one pass;
  - [web/src/render/quotes.ts](../../web/src/render/quotes.ts): `trimEnd()`,
    and the attribution pattern only runs on short lines;
  - outside the lane, one line each:
    [jmap/src/compose/quote.ts](../../jmap/src/compose/quote.ts) lines 92 and
    120 (`trimEnd()`), and
    [web/src/conversation/people.ts](../../web/src/conversation/people.ts)
    line 17 (a lookbehind keeps the address-in-name pattern linear).
  - Timing tests: "hostile plain text stays fast" in `render.test.ts`, and
    one each in `compose.test.ts` and `people.test.ts`.
- **F3 · Low · Every internationalised link was flagged.** Now only labels
  that mix scripts or imitate Latin are
  ([web/src/render/idn.ts](../../web/src/render/idn.ts), `idn.test.ts`).
- **F4 · Low · "Always display images from <sender>" trusted a forgeable
  From.** It now needs `dmarc=pass` for the sender's domain
  ([web/src/render/allowance.ts](../../web/src/render/allowance.ts)
  `dmarcPassed`; the call in `ConversationView.tsx` passes the message's
  Authentication-Results, one line). The global "always display" setting is
  unchanged. Tests in `render.test.ts`.
- **F5 · Info · DNS prefetch.** Every message frame turns it off (a meta in
  [srcdoc.ts](../../web/src/render/srcdoc.ts)), and so does the header.
  `dns.spec.ts` proves no message host is looked up.
