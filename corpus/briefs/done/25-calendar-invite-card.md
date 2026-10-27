# Task 25: Show a calendar invite and answer it

## Context

Promoted 2026-10-23 from the todo [calendar-invites](../../todos/calendar-invites.md).
The owner chose on 2026-10-23: a card and a reply only. Postern keeps no calendar
(the owner has Almanac for that), and there is no "Add to Almanac" button.

Gmail shows an invite card (time, place, Yes / No / Maybe) on a message carrying a
`text/calendar` part. Stalwart 0.16 advertises the JMAP calendars capability and has
a `/calendar/rsvp` endpoint; what it does with an incoming iMIP invite (RFC 6047) is
**not known yet**.

Where it plugs in (checked 2026-10-23):

- A message's body and attachments come from
  [`web/src/conversation/conversationStore.ts`](../../../web/src/conversation/conversationStore.ts)
  (`MESSAGE_BODY_PROPERTIES`: `htmlBody`, `textBody`, `bodyValues`, `attachments`).
  A `.ics` part shows today as an ordinary attachment.
- Message cards: `web/src/conversation/MessageCard.tsx`, `MessageBody.tsx`.
- Sending: `web/src/send/submit.ts` (`EmailSubmission/set`).
- The dev corpus has one calendar file already: `lisbon-wednesday.ics` in
  `dev/seed/conversations.ts` (a plain attachment, not an iMIP REQUEST).

**The invite is untrusted input**, like every message. The card is the app's own UI
built from parsed fields shown as text; nothing from the `.ics` is ever inserted as
HTML, and a URL in it is a plain link with the same treatment as links in mail
([security.md](../../wiki/security.md)).

## Files you OWN

- `web/src/invites/` (new): finding the `text/calendar` part, parsing the VEVENT,
  the card, building the reply
- `web/src/conversation/MessageCard.tsx` (placing the card above the body)
- `dev/seed/` (one iMIP REQUEST invite and one CANCEL, added to the corpus and the
  manifest counts)
- `corpus/.planned-roots` (add `web/src/invites`), corpus outcome, `status.md`,
  `log.md`, and the Stalwart findings on a wiki page

## Files you must NOT touch

- `web/src/render/` and `MessageFrame.tsx`: the message body's sandbox is unchanged.
- Anything that writes to a JMAP calendar.

## What to do

1. **Check Stalwart first**, in the dev stack: deliver an iMIP REQUEST between the
   two test accounts. Does Stalwart add anything to the message or to a calendar on
   its own? Does `/calendar/rsvp` or a JMAP call send a REPLY, or must Postern build
   the REPLY email itself? Write the answers down.
2. Parse only what the card needs: METHOD, SUMMARY, DTSTART / DTEND (with TZID or
   UTC), LOCATION, ORGANIZER, the signed-in identity's ATTENDEE line and its
   PARTSTAT, UID, SEQUENCE. A hand-written parser is fine at this size; if you add a
   library, pin it exactly and say why.
3. The card, above the body for METHOD:REQUEST: title, date and time in the
   account's time zone, place, organiser, and Yes / No / Maybe with the current
   answer marked. METHOD:CANCEL shows "This event was cancelled" and no buttons.
   An invite that doesn't name the user as an attendee shows the facts and no
   buttons.
4. Replying sends an iMIP REPLY to the organiser from the identity the invite was
   sent to (or uses Stalwart's way if step 1 found one), and the card shows the new
   answer. Answering again changes it.
5. A plain `.ics` attachment with no METHOD (like the Lisbon file) gets no card; it
   stays an attachment.

## Acceptance

- The seeded REQUEST shows a card with the right local time; Yes sends a REPLY the
  organiser's account receives, with `PARTSTAT=ACCEPTED` and the same UID.
- The seeded CANCEL shows the cancelled card.
- A hostile `.ics` (script in SUMMARY, a `javascript:` URL in LOCATION) renders as
  inert text; add it to the hostile fixtures.
- `npm run typecheck`, `npm run lint`, `npm test` and the browser tests pass.

## Outcome (2026-10-27)

Done, in `38c7d5a`.

**Step 1, against the dev Stalwart (0.16.25), 2026-10-27.** Bob sent alice an
iMIP REQUEST (a `text/calendar; method=REQUEST` alternative, the times in a
TZID) through `EmailSubmission`:

- It arrived in alice's Inbox as it was sent: Stalwart added only its delivery
  headers (`Delivered-To`, `X-Spam-Status`, DKIM), no part and no keyword.
- No event appeared in alice's calendar, which stayed empty.
- `/calendar/rsvp` is an HTML page for the RSVP links in invitations Stalwart
  sends itself (from calendar scheduling). It has nothing for an invite that
  came by mail, and no JMAP call answers one without writing to a calendar.
- So Postern builds the REPLY email itself. Creating a `text/calendar` part
  with its `method` parameter takes `header:Content-Type` on the part;
  `charset` can't be given with a `partId`, and `headers` can't be given at
  all.

**Built** (`web/src/invites/`):

- **The parser** (`ics.ts`), by hand as the brief allowed, so no library was
  added. It reads METHOD, and from the master VEVENT (not a changed instance)
  SUMMARY, DTSTART / DTEND, LOCATION, ORGANIZER, each ATTENDEE with its
  PARTSTAT, UID and SEQUENCE. It unfolds lines, unescapes text and reads
  quoted parameter values. A time is UTC, a date (all day), or a TZID: an
  IANA zone through Intl; otherwise the offset the VTIMEZONE gives for that
  time of year (an Outlook "W. Europe Standard Time"); failing both, local
  time, and the card says so. It reads nothing over 256 KB.
- **The card** (`InviteCard.tsx`) sits above the body in `MessageCard.tsx`. It
  reads the message's `text/calendar` part, or else an `.ics` file. For
  METHOD:REQUEST it shows the title, the time in the browser's time zone (no
  account time zone exists), the place, the organiser, and Yes / No / Maybe
  with the answer marked. METHOD:CANCEL shows "This event was cancelled" and
  no buttons. An invite that names none of the user's identities shows the
  facts only. PUBLISH or no METHOD gets no card. The brief called the Lisbon
  file METHOD-less; it is METHOD:PUBLISH, and gets no card either way.
  Everything is text. Only an `http(s)` LOCATION becomes a link, with a new
  tab, no opener and no referrer.
- **The reply** (`reply.ts`) is a multipart/alternative: a line of text and
  the `text/calendar; method=REPLY` with the same UID and SEQUENCE and the
  attendee's PARTSTAT. It goes from the identity whose address the invite
  named, to the organiser, through `submitDraft`, so it is filed in Sent. The
  answer is kept on the invite message as `$rsvp-accepted`, `-declined` or
  `-tentative`, so every device marks it. Answering again sends a new REPLY
  and moves the keyword. Nothing is written to a JMAP calendar.
- **The seed.** `dev/seed/` has bob's REQUEST ("Q1 planning", 10:00 Lisbon
  time) and his CANCEL ("Sprint retro") in alice's Inbox, so a REPLY reaches an
  organiser's mailbox the tests can read. The book club invite was already
  seeded, but its organiser is outside `postern.test`, so it is not for
  clicking Yes in tests. A hostile invite (`hostile/invites/ics-invite.eml`:
  script and an image tag in SUMMARY, `javascript:` in LOCATION, markup in the
  organiser's name) joins the Hostile set. It sits in a subfolder, read after
  the other fixtures. That keeps the sanitiser's own fixture test (in
  `web/src/render/`, which this brief must not touch) at its 17 HTML
  fixtures, and leaves the others' read state and dates as they were. The
  manifest was regenerated and the dev Stalwart reseeded clean: Inbox 2147
  messages, 2038 conversations, 129 unread; Hostile 18, 18, 5.
- **Outside the brief's list, needed by the seed change:**
  `web/e2e/hostile.spec.ts` (the new fixture's markers, which must not be a
  bare `<script` because Postern's own script tag has one, plus a test of the
  card), the counts in `web/e2e/README.md`, and
  `jmap/test/integration/read.test.ts`, which now reads the Inbox count from
  the manifest.

Left for the owner:

- Only the card answers; there is no calendar, as decided. An invite whose
  organiser is outside the domain gets a REPLY by ordinary mail, as Gmail's
  does.
- The `text/calendar` part still shows in the attachment list too, as before.

Checked:

- `npm run check`: 1240 tests, including parser, reply and card tests: Yes
  sends the REPLY and marks the answer, No changes it, CANCEL, PUBLISH,
  someone else's invite, and the hostile one as inert text.
- `npm run test:e2e`: 36 passed, the hostile suite's `ics-invite` and the new
  card test included.
- In Chromium against the dev Stalwart, browser time zone Europe/Bucharest:
  the seeded REQUEST's card said "Thu, Nov 5, 2026, 12:00 PM" (10:00 in
  Lisbon). Yes sent a REPLY that bob's account received with
  `ATTENDEE;PARTSTAT=ACCEPTED` and `UID:q1-planning-2026-11-05@postern.test`,
  and Yes stayed marked after a reload. The CANCEL's card said the event was
  cancelled, with no buttons, and the Lisbon PUBLISH file got no card. The
  replies were removed afterwards, the invite's keywords were put back, and the
  counts matched the manifest.

brief-board is down (since 2026-10-13), so nothing was posted there.
