---
summary: Every security finding from brief 17's whole-repo review (2026-10-20), by severity, with file and line, what an attacker gets, and whether it was fixed (with its test) or is open and whose lane the fix belongs in. The High one, the service worker's precache any script on the shared origin could rewrite, is fixed (hashes baked into sw.js, checked on every read). Read before working on the service worker, push, prefs, filters or anything the shared origin can reach, and when picking security follow-ups.
updated: 2026-10-20
---

# Security findings (brief 17)

The review covered `jmap/src/**` and `web/src/**`, beyond the two reviews of
rendering and sign-in. Threat model and rules: [security.md](security.md);
headers: [security-headers.md](security-headers.md). "Same-origin script"
means a script running in any estate app on the shared origin
([decisions.md](decisions.md)). Line numbers are as of 2026-10-20.

## Open

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
- `npm audit` (2026-10-20, after brief 17): one moderate advisory in Vite
  8.2.2's dev server (`launch-editor` on Windows, GHSA-698v-4r3x-3vcv). Dev
  only, never shipped, and the estate pins Vite 8.2.2; left until the house
  stack moves.

## Fixed after brief 17 (each with a test)

- **F1 · High · A same-origin script could replace what the worker serves as
  Postern.** Fixed: the build bakes a SHA-256 of every shell file into
  `sw.js`, and [web/src/sw/shell.ts](../../web/src/sw/shell.ts) serves a
  cached body only if it hashes right, built into a fresh response with
  production's headers ([headers.ts](../../web/src/sw/headers.ts), shared
  with the e2e suite); anything else is dropped and goes to the network.
  Tests: `shell.test.ts`, and the three worker tests in `tokens.spec.ts`
  (forged page, stripped headers plus a forged script, offline).
- **F7 · Low · Any same-origin page could make the worker take over.** Fixed:
  `SKIP_WAITING` counts only from a top-level window under `/webmail/`
  (`mayRequestUpdate`), and no signed-in Postern tab reloads when a new
  worker takes over (`onNeedReload` in `web/src/push/install.ts`). Tests in
  `web/src/sw/notify.test.ts`.
- **F8 · Low · The page took worker messages from any worker.** Fixed: a
  message counts only from the `/webmail/` registration's active worker
  running `/webmail/sw.js` (`acceptsSource` in `web/src/push/register.ts`). Tests in
  `web/src/push/register.test.ts`.

### F9 · Low · "Also apply to matching conversations" can search for something else

- **Where:** [web/src/filters/retroactive.ts](../../web/src/filters/retroactive.ts)
  line 20 (`criteriaToSearch`) passes "Has the words" through as search
  syntax, since `joinWords` (`jmap/src/sieve/model.ts` line 124) quotes only
  words with a space in them: `-foo` becomes NOT, `OR` and `AND` vanish. A filter whose words are just `OR` matches all
  mail outside Spam and Trash, and a Delete action then hits up to 5,000
  conversations (undoable). The user types the words, hence Low.
- **Fix:** quote each word in `criteriaToSearch`, and show the count first.
- **Fixed (2026-10-20, `095c59f`):** words that look like search syntax
  (`OR`, `AND`, a leading `-`, a colon or brackets) are quoted, so the
  search reads them as plain words, as the Sieve rule does.

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
