# Task 09: Labels

## Context

Gmail's labels map onto JMAP mailboxes. A message can carry several, and
archive means leaving the Inbox ([decisions.md](../../wiki/decisions.md),
[glossary.md](../../wiki/glossary.md)). Labels made here also show up as
folders in IMAP clients on the owner's phone, which is the point of the
mapping.

## Files you OWN

- `web/src/labels/**`: the label menu (apply and remove, with checkboxes,
  search and "Create new"), move to, the label manager in settings, colour
  picking
- `web/src/actions/labels.ts`: `mailboxIds` patches for apply, remove and move
- `corpus/wiki/open-questions.md`: answer where label colours live

## What to do

1. **Apply and remove** on a selection or a conversation, Gmail's
   checkbox-menu style. A partial state shows as indeterminate.
2. **Move to** removes the current label and adds the target, as in Gmail.
3. **Create, rename, nest** (`parentId`) **and delete** labels. Deleting moves
   messages that would be left with no label into All Mail first. System
   labels cannot be renamed or deleted.
4. **Navigation:** show or hide each label, show only if unread, and
   drag-and-drop a conversation onto a label.
5. **Colours.** JMAP `Mailbox` has no colour. Decide with the owner:
   - per device;
   - a settings blob through JMAP FileNode (see brief 12);
   - a hidden settings message.

   Implement the choice and record it.

## Acceptance

- On `dev/`, labels created in Postern appear as folders in an IMAP client for
  alice, and the reverse also holds.
- A message in two labels shows both chips, and appears in both labels' lists.
- Deleting a label never leaves a message with no label (checked with
  `Email/get`).
