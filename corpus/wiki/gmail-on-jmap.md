---
summary: Which Gmail feature maps to which JMAP object or method on Stalwart 0.16, and whether it is native, client-side, needs checking, or impossible without server work. Conversations, labels and archive, stars and unread, search operators, drafts and sending, undo send, signatures, vacation, filters, spam, contacts, push, attachments, quota, and the Gmail features deferred to todos. Read before writing or working any feature brief.
updated: 2026-10-09
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
| All Mail | the archive-role mailbox, plus "no filter" for search | native | 05, 09 |
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
