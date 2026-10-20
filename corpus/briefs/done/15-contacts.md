# Task 15: Contacts and recipient autocomplete

## Context

Gmail suggests recipients from Contacts and from "Other contacts", the people
you have written to. Stalwart 0.16 serves JMAP Contacts (`AddressBook`,
`ContactCard`, in JSContact format), the same data its CardDAV gives the
owner's phone.

## Files you OWN

- `jmap/src/contacts/**`: AddressBook and ContactCard query, get and set (the
  types exist from brief 03)
- `web/src/contacts/**`: autocomplete, the sender hover card, a minimal
  Contacts page (list, search, add, edit, delete)
- `web/src/composer/recipients.ts`: wire contacts into brief 08's chips

## What to do

1. **Autocomplete** ranks contacts and recent correspondents by name or address
   prefix, plus frequency. Show name and address. Groups expand to members, if
   JSContact groups are used.
2. **"Other contacts":** addresses you sent to, collected from Sent with
   `Email/query`. Suggested, but not stored as contacts unless the user adds
   them.
3. **The hover card** on a sender: name, address, "Add to contacts", "Email",
   "Search mail from".
4. **A minimal Contacts page** at `#contacts`: list and search, add and edit
   name, emails, phones and a note. A contact edited here shows on a CardDAV
   phone after sync.

## Acceptance

- On `dev/`, typing "bo" in To suggests bob from contacts, and anyone alice has
  written to.
- A contact added in Postern appears through CardDAV (check with a client or
  `curl`).
- Hover cards open on hover and on keyboard focus.

## Outcome (2026-10-20)

Built. Autocomplete ranks saved contacts and "Other contacts" (addresses
alice sent to, collected from Sent and never stored) by match, then
frequency and recency; a matching group expands to its members. The sender
hover card opens on hover and on keyboard focus. The Contacts page lists,
searches, adds, edits and deletes. On `dev/`, "bo" suggested bob and "ca" an
Other contact; a contact added in Postern appeared over CardDAV as a vCard
4.0. Stalwart's quirks are in [gmail-on-jmap.md](../../wiki/gmail-on-jmap.md).
Not done: picking a group as one chip (needs a composer change), live sync of
contacts (they refresh after 30 s or when the page opens), and de-duplicating
contacts from the search box's sender suggestions.
