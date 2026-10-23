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
