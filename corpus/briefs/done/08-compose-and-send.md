# Task 08: Compose and send

## Context

Gmail's composer:
- a window docked bottom-right that minimises, stacks, and pops out full
  screen;
- reply and forward inline in the conversation.

On JMAP:
- a draft is an `Email` in the Drafts label with `$draft`;
- sending is `EmailSubmission/set` with `onSuccessUpdateEmail`, which moves the
  message to Sent and drops `$draft`.

See [gmail-on-jmap.md](../../wiki/gmail-on-jmap.md).

## Files you OWN

- `web/src/composer/**`: the composer window manager, the inline reply, the
  editor, the recipient chips, the attachment tray
- `web/src/send/**`: draft save, send, undo send, the outbox state
- `jmap/src/compose/**`: helpers that build MIME bodies and reply/forward
  headers (`In-Reply-To`, `References`, the `Re:` and `Fwd:` subjects)

## What to do

1. **Windows.**
   - Several composers at once, each docked bottom-right.
   - Minimise, maximise, close (which keeps the draft).
   - Discard, with a confirm.
2. **Recipients.**
   - To / Cc / Bcc as chips.
   - Paste a list; validate addresses.
   - Autocomplete from recent recipients for now; brief 15 adds contacts.
3. **Editor.**
   - Rich text: bold, italic, underline, lists, links, quote, remove
     formatting.
   - Paste is sanitised.
   - It sends both `text/html` and a `text/plain` alternative.
   - A plain-text mode is available.
4. **Attachments.**
   - Upload through the blob endpoint with progress, drag and drop onto the
     window.
   - Pasted images go inline as `cid:` parts.
   - Warn before sending when the text says "attached" and nothing is.
5. **Drafts.**
   - Autosave a few seconds after typing stops, with "Saving…" and "Saved"
     states.
   - Reopen from the Drafts label.
   - The draft is replaced on each save, not duplicated.
6. **Reply, reply all and forward.**
   - Quote the original, Gmail-style ("On <date>, <name> wrote:").
   - Thread with `In-Reply-To` and `References`.
   - Forward carries the attachments.
7. **Send.**
   - Pick the identity (From), with its signature inserted.
   - Undo send: hold the submission in the client for the configured delay
     (default 5 s, setting in brief 12), with a "Message sent. Undo / View
     message" toast.
   - After sending, the conversation shows the sent message.
8. **Failure.** Keep the draft, explain the error. Outbound port 25 may still
   be blocked in production. On `dev/`, send between alice and bob.

## Acceptance

- On `dev/`: alice writes to bob with an attachment and an inline image. Bob
  receives it, threaded, and the attachment opens.
- Reply and forward thread correctly: one conversation in both mailboxes.
- Drafts autosave and survive closing the window. Undo send returns the draft.
- Unit tests cover the reply and forward header building and the quoting.

## Outcome (2026-10-20)

Built with no new dependency: Postern's own contentEditable editor (no
`execCommand`), with one sanitising entry point (`sanitizeForEditor`, a
strict DOMPurify allow-list) for paste, drop, reopened drafts, signatures
and quotes. Quoted originals are text only. On `dev/`, alice sent bob a
message with an attachment and an inline image (bytes matched by sha256),
and a reply and a forward each stayed one conversation in both mailboxes.
Drafts autosave 2.5 s after typing and reopen from Drafts in the composer;
undo send holds the submission 5 s (`setUndoSendDelay` for brief 12).

Not as specified: a send to an unreachable domain cannot fail at send time
on Stalwart 0.16; it moves to Sent and a bounce arrives later (see
[gmail-on-jmap.md](../../wiki/gmail-on-jmap.md)). Errors the server does
report keep the draft and explain. Automatic Bcc from an identity is not
applied. The controller hid reply drafts from the conversation's message
cards, since the composer shows them inline. The build now warns that the
main chunk is 548 kB.
