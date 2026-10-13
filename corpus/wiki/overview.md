---
summary: What Postern is in a paragraph. A Gmail-like webmail for the owner's own mail on the production domain, a static web app at /webmail that talks JMAP to the estate's Stalwart server, with no backend of its own. Who uses it, what it copies from Gmail, what it leaves out, and where the other pieces live.
updated: 2026-10-09
---

# Overview

Postern is the owner's webmail. It reads and sends mail for addresses like
`johndoe@example.com` and looks and works the way Gmail does: conversations instead of
loose messages, labels instead of folders, a search box that understands
`from:` and `has:attachment`, a composer that floats bottom-right, keyboard
shortcuts, and live updates.

It is a static web app, served at `/webmail`. Everything it
knows comes from the estate's mail server, Stalwart, over JMAP (RFC 8620 and
8621), a JSON-over-HTTPS mail protocol. Stalwart parses MIME, threads
conversations, runs the search and pushes changes, so Postern needs no server
of its own. It reaches Stalwart at `/webmail-api`, on the same
origin, so the browser needs no CORS.

**Users:** the owner first, plus anyone the owner gives a mailbox on
the production domain. Phones and desktop mail apps keep working over IMAP. Postern is in
addition to them, not instead.

**Left out on purpose:**

- Google's brand: the layout is familiar, the identity is Postern's
  ([design.md](design.md)).
- Chat, Meet and smart compose.
- Anything that needs a server Postern would have to run.

**Waiting on the server:** snooze, scheduled send, inbox category tabs and
calendar invites are captured in `todos/`. Each needs something Stalwart does
not do yet, or that has to be checked first.

**Where the other pieces live:**

- The mail server is the `mail` stack in `../vps-deploy`:
  `../vps-deploy/stacks/mail.ts` and `../vps-deploy/infrastructure/mail/`.
- Postern's own deploy (brief 18) adds a stack there, plus the
  `/webmail-api` route on the mail stack.
- The name: a postern is the small side gate in a castle wall, which fits an
  estate whose services are called ward, citadel and atrium.
