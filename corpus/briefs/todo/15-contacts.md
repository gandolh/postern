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
