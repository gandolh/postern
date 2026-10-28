---
summary: Which Gmail feature maps to which JMAP object or method on Stalwart 0.16, and whether it is native, client-side, needs checking, or impossible without server work. Conversations, labels and archive, stars and unread, search operators, drafts and sending, undo send, signatures, vacation, filters, spam, contacts, push, attachments, quota, and the Gmail features deferred to todos. Read before writing or working any feature brief.
updated: 2026-10-28
---

# Gmail on JMAP

Stalwart 0.16 advertises these JMAP capabilities (from its source, 2026-10-09):
core, mail, submission, vacationresponse, sieve, quota, blob, contacts,
calendars, principals, mail:share, websocket, plus Web Push for
`PushSubscription`. Words below follow [glossary.md](glossary.md).

| Gmail | JMAP on Stalwart | Kind | Brief |
|---|---|---|---|
| Conversations | `Thread`; `Email/query` with `collapseThreads: true` | native | 06, 07 |
| Conversation view off | `Email/query` without `collapseThreads`; each row a one-message conversation, opening that message alone (`#inbox/<threadId>/<emailId>`) | native | 22, 26 |
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
| Report spam / not spam | move to or from junk; `$junk` / `$notjunk` keywords; trains Stalwart's classifier | native | 13 |
| Contacts, autocomplete | `AddressBook`, `ContactCard` (JMAP Contacts) | native | 15 |
| New mail live | event source read with `fetch()`; `Email/changes`, `queryChanges` | native | 11 |
| Notifications while closed | `PushSubscription` + Web Push | native | 16 |
| Storage meter | `Quota/get` | native | 12 |
| Keyboard shortcuts | the app | client-side | 14 |
| Snooze | a hidden "Snoozed" mailbox and a `$snoozed-<time>` keyword; an open Postern moves it back; the Inbox sorts `hasKeyword $woken` first | client-side | 24 |
| Schedule send | `EmailSubmission` held with FUTURERELEASE `HOLDUNTIL` in the envelope; the draft waits marked `$scheduled`; the client files it in Sent once the submission is final | native, client-filed | 23 |
| Category tabs (Primary, Social, Promotions) | no classifier; Sieve on headers at best | needs server work | todo |
| Calendar invites, RSVP | the `text/calendar` part parsed in the browser; the REPLY sent as an ordinary email; the answer kept as a `$rsvp-*` keyword; no JMAP calendar | client-side | 25 |

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
  `maxDelayedSend` 2592000 and FUTURERELEASE, which schedule send uses.
- **Schedule send** (brief 23, 2026-10-27): a client-set `sendAt` is refused
  (`invalidProperties`); `HOLDUNTIL` (or `HOLDFOR`) in the envelope's
  `mailFrom.parameters` holds the message, and a client envelope must list
  every recipient, Bcc included. Until then the submission reads
  `undoStatus: "pending"` with `sendAt` the hold time. Held messages arrived
  3 to 19 s after their time, never before, and survived a restart.
  `undoStatus: "canceled"` stops one; after release that answers
  `cannotUnsend`. On release `undoStatus` reads "final", but no state changes
  and no push comes, so the client has to look. `onSuccessUpdateEmail` works
  on create, not on update. `EmailSubmission/query` filters by `undoStatus`
  and `emailIds` but cannot sort by `sendAt`. Destroying a pending submission
  does not stop it: two held messages whose submissions were destroyed were
  delivered at their time anyway. Only `undoStatus: "canceled"` cancels.
- **Calendar invites** (brief 25, 2026-10-27): a delivered iMIP REQUEST is left
  as it came, with no event added to the calendar, and `/calendar/rsvp` only
  serves Stalwart's own invitations, so the client sends the REPLY. A created
  `text/calendar` part takes its `method` through `header:Content-Type`.
- **Snooze** (brief 24, 2026-10-27): nothing moves or flags a message at a
  time. The Sieve extensions are the stock set, `urn:stalwart:jmap` is empty,
  and JMAP has no timer. Keywords keep their case, and a 309-character one was
  accepted. `Email/query` sorts by `hasKeyword` (with `collapseThreads`) and
  `queryChanges` works with that sort.
- **Settings** (brief 12): `VacationResponse` works as the RFC says (null
  dates mean always on) and has no "contacts only" switch. `Quota/get`
  returns nothing until a quota is set, then one account-wide octets quota.
  `Identity/set` updates name, reply-to and both signatures.
- **Contacts** (brief 15): each account has one default address book, which
  CardDAV serves at `/dav/card/<account>/default/`. Stalwart assigns no `uid`
  to a card created over JMAP, and a `uid` cannot change later, so Postern
  sets `urn:uuid:<random>` on create; groups (`kind: "group"`) list members
  by uid. Patching the full name leaves the old components behind, so edits
  replace whole maps.
  `ContactCard/query` text and name filters found
  nothing in tests, so Postern loads every card and filters in the browser.
- **Filters** (brief 13): Postern writes one script, `postern`, marked as
  generated, files labels by mailbox id (RFC 9042, which also needs
  `require "mailbox"`), and keeps blocked senders in it so they sync. A
  hand-written active script is kept running through `include :personal
  :optional`. Stalwart allows one active script, and **the vacation
  responder is itself a script** (`vacation`): turning it on stops the
  filters, and turning it off turns them back on. An explicit `fileinto`
  overrides Stalwart's spam verdict, which is how "never send it to Spam"
  works. Sieve quirks: a variable set inside a block is local to it, `${`
  in any string is read as a variable, and backslashes are written as
  `${hex:5C}`. Sieve's `:contains` matches substrings, not Gmail's whole
  words.
- **Report spam trains the classifier.** Gaining `$junk` or the Junk label
  stores a spam sample; gaining `$notjunk`, losing `$junk` or leaving Junk
  (other than to Trash) stores a not-spam one (Stalwart's
  `Email/set` handler, checked in its v0.16.25 source). The classifier is FTRL logistic regression,
  retrained every 12 hours once it has 100 samples of each kind. The UI says
  "Your mail server learns from this."
- **Web Push** (brief 16): the VAPID key is the session capability
  `urn:ietf:params:jmap:webpush-vapid` (`applicationServerKey`). With
  `emailpush`, a subscription can ask for the new message's id, thread,
  sender and subject on delivery, filtered to the Inbox, encrypted to the
  subscription's keys. `PushSubscription/get` will not return `url` or `keys`,
  so a device finds its own subscription by `deviceClientId`. Stalwart caps
  `expires` at 7 days; every sign-in extends it, and a device unused for a
  week stops getting pushes until it signs in. One verification push per
  account per minute; the push URL must be https.
