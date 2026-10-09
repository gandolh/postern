---
summary: Genuinely unresolved questions as of 2026-10-09, each naming the brief that settles it. Whether Stalwart needs Postern registered as an OAuth client; staying signed in across reloads without storing tokens; where per-user display settings and label colours live; whether Stalwart's spam filter learns from Report spam; whether an offline cache is acceptable on the shared origin. Delete an entry the moment it is answered.
updated: 2026-10-09
---

# Open questions

Delete an entry the moment it is answered. The history goes to `log.md`.

## Does Postern have to be registered with Stalwart as an OAuth client?

Stalwart checks the client ID and redirect URI when it swaps a code for tokens.
It supports dynamic client registration (`registration.rs` in its source) and
can verify a client secret, and its own web UI uses the client ID
`stalwart-webui`. What a public browser client with its own sign-in form has
to do is unchecked. Brief 04.

## Can a user stay signed in across a reload?

Tokens live in memory only ([decisions.md](decisions.md)), so a reload signs the
user out. That is safe, and unlike Gmail. The options to weigh in brief 04:

- accept it;
- a short-lived refresh token kept only in a service worker's memory;
- re-authenticate quietly with an app password the browser's password manager
  fills.

Each has its own leak path on a shared origin. The owner chooses.

## Where do display settings and label colours live?

JMAP has no generic per-user settings object, and `Mailbox` has no colour. The
options:

- per device in the browser: simple, and lost on a new device;
- a JSON blob in Stalwart through JMAP FileNode (it advertises `filenode`);
- a hidden label holding one settings message.

Briefs 09 and 12.

## Does Stalwart's spam filter learn from Report spam?

Gmail trains on it. Stalwart's filter has a Bayes classifier and a
`trainSpamClassifier` task. Whether moving a message to Spam, or the
`$junk` / `$notjunk` keywords, feeds it is unchecked. Brief 13.

## Is an offline cache acceptable on the shared origin?

Gmail caches mail for offline reading. In IndexedDB on `gandolh.ro`, the cache
would be readable by any script on the estate's origin, even with Postern
closed. Encrypting it with a key held only in memory protects nothing while
the app is open. Brief 16 decides, with the owner.
