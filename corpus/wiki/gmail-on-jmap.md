---
summary: Which Gmail feature maps to which JMAP object or method on Stalwart 0.16, and whether it is native, client-side, needs checking, or impossible without server work. Conversations, labels and archive, stars and unread, search operators, drafts and sending, undo send, signatures, vacation, filters, spam, contacts, push, attachments, quota, and the Gmail features deferred to todos. Read before writing or working any feature brief.
updated: 2026-10-20
---

# Gmail on JMAP

Stalwart 0.16 advertises these JMAP capabilities (from its source, 2026-10-09):
core, mail, submission, vacationresponse, sieve, quota, blob, contacts,
calendars, principals, mail:share, websocket, plus Web Push for
`PushSubscription`. Words below follow [glossary.md](glossary.md).

| Gmail | JMAP on Stalwart | Kind | Brief |
|---|---|---|---|
| Conversations | `Thread`; `Email/query` with `collapseThreads: true` | native | 06, 07 |
| Labels | `Mailbox`; a message's `mailboxIds` is a set | native | 09 |
| Inbox, Sent, Drafts, Spam, Trash | mailboxes with `role` inbox, sent, drafts, junk, trash | native | 05 |
| All Mail | the list: everything outside Spam and Trash (`inMailboxOtherThan`); archived mail with no label goes to the archive-role mailbox | native | 05, 06 |
| Archive | remove the Inbox from `mailboxIds`; with no other label, add Archive | native | 06 |
| Starred | keyword `$flagged` | native | 06 |
| Read / unread | keyword `$seen` | native | 06, 07 |
| Important marker | keyword `$important` set by the client; no ranking | client-side | 06 |
| Search operators | `Email/query` filter: from, to, cc, bcc, subject, body, text, hasAttachment, inMailbox, before/after, minSize/maxSize, hasKeyword; AND/OR/NOT operators | native | 10 |
| Search highlights | `SearchSnippet/get` | native | 10 |
| Drafts, autosave | `Email/set` into the drafts mailbox with `$draft` | native | 08 |
| Send | `EmailSubmission/set` with `onSuccessUpdateEmail` (to Sent, drop `$draft`) | native | 08 |
| Undo send | hold the submission in the client for N seconds | client-side | 08 |
| Attachments | blob upload/download (`uploadUrl`, `downloadUrl`) | native | 07, 08 |
| Inline images | `cid:` parts in the HTML body | native | 07, 08 |
| Send as, signatures | `Identity` (`textSignature`, `htmlSignature`) | native | 08, 12 |
| Vacation responder | `VacationResponse` | native | 12 |
| Filters | `SieveScript` (JMAP for Sieve); Postern writes the Sieve | native, generated | 13 |
| Block sender | a Sieve rule to Spam or discard | native, generated | 13 |
| Report spam / not spam | move to or from junk; `$junk` / `$notjunk` keywords | native; training to check | 13 |
| Contacts, autocomplete | `AddressBook`, `ContactCard` (JMAP Contacts) | native | 15 |
| New mail live | event source read with `fetch()`; `Email/changes`, `queryChanges` | native | 11 |
| Notifications while closed | `PushSubscription` + Web Push | native | 16 |
| Storage meter | `Quota/get` | native | 12 |
| Keyboard shortcuts | the app | client-side | 14 |
| Snooze | nothing schedules a message's return | needs server work | todo |
| Scheduled send | `EmailSubmission` `sendAt` if Stalwart honours FUTURERELEASE | to check | todo |
| Category tabs (Primary, Social, Promotions) | no classifier; Sieve on headers at best | needs server work | todo |
| Calendar invites, RSVP | calendars capability; Stalwart has `/calendar/rsvp` | to check | todo |

## Two JMAP facts that shape the UI

- **A message is always in at least one mailbox.** Hence the archive rule
  above, and Trash and Spam as real mailboxes rather than flags.
- **Postern has no server state of its own.** Anything that must survive the
  browser goes into a JMAP object. A preference that cannot (label colours,
  density) is per device unless brief 09 or 12 finds a home for it.

## What Stalwart 0.16.25 actually does (found in brief 02, 2026-10-20)

- **No All Mail by default.** A new account gets Inbox, Sent Items, Drafts,
  Junk Mail and Deleted Items, but no archive-role mailbox. Postern must create
  one ("Archive", role `archive`) the first time it needs it, on the owner's
  real account too. Always find system labels by `role`, never by name.
- **No header search.** `Email/query` with a `header` condition returns
  nothing, for `Message-ID` and custom headers alike. `from`, `to`, `subject`,
  `text`, `inMailbox` and the keyword conditions work. Gmail's `rfc822msgid:`
  has no server side.
- **Threading needs the subject too.** A reply joins a conversation only when
  its references match and its normalised subject matches. A reply that
  changes the subject starts a new conversation.
- **Session URLs name Stalwart's own host** (`https://mail.<host>/jmap/...`,
  https even without TLS), so the client always rebases them.
- **Downloads need the token.** The download endpoint wants `Authorization`,
  so a plain `<img src>` gets a 401. The app fetches the blob and shows it
  through an object URL. Every download is sent as an attachment.
- **The event stream** pings every 30 s at the shortest and sends nothing on
  connect. A bad `sinceState` comes back as `invalidArguments`, which the
  client treats like `cannotCalculateChanges`.
- **Search** (brief 10): `from`, `to`, `cc`, `subject`, `body`, `text`,
  `hasAttachment`, `before`/`after`, `minSize`/`maxSize`, the keyword and
  mailbox conditions and AND/OR/NOT all work. Words match whole and
  case-insensitive, with no prefix match (`road` misses "roadmap"), and a
  quoted phrase is matched as separate words. An empty OR matches nothing.
  `bcc` is accepted but unproven. Gmail's `rfc822msgid:`, `list:`,
  `deliveredto:`, `replyto:`, `filename:` and `category:` have nothing to map
  to; Postern searches them as text and says so.
- **Writing mail** (brief 08): an existing Email's subject and body cannot be
  updated, so a draft is replaced by create plus destroy in one request,
  keeping its Message-ID and so its conversation. A create refuses `null` on
  an address header. A forward can reuse the original's part `blobId`s
  without downloading. `sentAt` is stamped by the server; Bcc is stripped
  from delivered copies and kept on the Sent copy. A custom `header:X-*` on a
  draft is delivered to the recipient, so internal markers never go there.
- **A failed delivery is not a send error.** `EmailSubmission/set` to an
  unreachable domain succeeds and the message moves to Sent; the failure
  arrives later as a bounce in the Inbox. Submission advertises
  `maxDelayedSend` 2592000 and FUTURERELEASE, which the scheduled-send todo
  needs.
- **Settings** (brief 12): `VacationResponse` works as the RFC says (null
  dates mean always on) and has no "contacts only" switch. `Quota/get`
  returns nothing until a quota is set, then one account-wide octets quota.
  `Identity/set` updates name, reply-to and both signatures.
