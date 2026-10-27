---
summary: Postern's vocabulary, one canonical word per concept with the synonyms it replaces, mapping Gmail's words (what the UI says) to JMAP's (what the jmap package says). Conversation, message, label, system label, Inbox, archive, All Mail, star, Spam, draft, invite, snoozed, scheduled message, composer, identity, snippet, reading pane, conversation view, keyword, mailbox. Use these words in code, UI copy and briefs.
updated: 2026-10-27
---

# Glossary

UI copy uses Gmail's words. The `jmap` package uses JMAP's. Where they differ,
both are given.

## Mail

**Message**:
One email. A JMAP `Email`.
_Avoid_: mail item, email object (in UI copy).

**Conversation**:
The messages that belong together as replies, shown as one row. A JMAP `Thread`.
_Avoid_: thread (in UI copy), chain.

**Snippet**:
The line of preview text after the subject in the list, or the highlighted
excerpt of a search hit.
_Avoid_: preview, excerpt.

**Draft**:
A message being written. It sits in the Drafts label with the `$draft` keyword.
_Avoid_: unsent message.

**Snoozed**:
Put out of the Inbox until a chosen time: the conversation waits in the Snoozed
label and an open Postern brings it back, unread and on top (brief 24).
_Avoid_: deferred, remind me, hidden until.

**Invite**:
A message carrying an iCalendar REQUEST or CANCEL. Postern shows it as a card
above the body and answers it with a REPLY email; it keeps no calendar
(brief 25).
_Avoid_: invitation card, event email, RSVP mail.

**Scheduled message**:
A message handed to the server to send at a chosen time (Schedule send). It
waits as a draft marked `$scheduled`, is listed under Scheduled, not Drafts,
and is filed in Sent once it has gone (brief 23).
_Avoid_: delayed send, send later, queued message.

## Organising

**Label**:
A named group a message can be in, any number at once. A JMAP `Mailbox`. In
code outside the `jmap` package, say label.
_Avoid_: folder, tag, category.

**Mailbox**:
JMAP's name for a label. Used only inside the `jmap` package and its types.
_Avoid_: using it in UI copy.

**System label**:
A label with a JMAP `role`: Inbox, Sent, Drafts, Spam (role `junk`), Trash,
All Mail (role `archive`). It cannot be renamed or deleted.
_Avoid_: special folder, default label.

**Archive**:
To take a conversation out of the Inbox without deleting it. Its messages keep
their other labels, or move to All Mail if they had none.
_Avoid_: file, store.

**All Mail**:
The archive-role label, where archived messages without other labels live.
"Search All Mail" means no label filter.
_Avoid_: archive folder.

**Star**:
A personal marker on a message. The `$flagged` keyword.
_Avoid_: flag, favourite.

**Spam**:
The label for unwanted mail; JMAP role `junk`. "Report spam" moves a message
there and marks it `$junk`.
_Avoid_: junk (in UI copy).

**Keyword**:
JMAP's per-message marker (`$seen`, `$flagged`, `$draft`, `$junk`). Used only
inside the `jmap` package.
_Avoid_: flag, tag.

## Writing

**Composer**:
The window a draft is written in. Docked bottom-right, or full screen.
_Avoid_: editor, compose box.

**Identity**:
An address the user can send as, with its name and signature. A JMAP `Identity`.
_Avoid_: alias, sender profile.

## Reading

**Reading pane**:
Where an open conversation shows when the list stays visible: to the right,
below, or off (full width).
_Avoid_: preview pane, split view.

**Conversation view**:
Gmail's setting for the list: on, one row per conversation; off, one row per
message (brief 22). In code, `ConversationView` is the screen of an open
conversation, a different thing; briefs call that the reading view.
_Avoid_: threading, thread mode.
