# Postern corpus index

Start here. Triage on the summary lines and open at most 2-3 pages.

- [CLAUDE.md](CLAUDE.md) - the rules for this corpus
- [routing.md](routing.md) - which skill runs the work, which layer answers which question
- [log.md](log.md) - chronological record of meaningful changes

## Wiki

<!-- BEGIN CATALOG -->

- [wiki/architecture.md](wiki/architecture.md) - How Postern is put together, as designed on 2026-10-09 (nothing built yet). The three workspaces (jmap client, web app, dev mail server), the request path through Caddy to Stalwart on the same origin, JMAP session-URL rebasing, sign-in with OAuth and PKCE through Stalwart's own endpoints, live updates by fetch-streamed event source plus Web Push, where state lives, local development, and the deploy.
- [wiki/decisions.md](wiki/decisions.md) - Locked calls for Postern, each with date, rejected alternatives and reason. Own Gmail-like app rather than an existing client; JMAP not IMAP; no backend of its own; served at gandolh.ro/webmail with Stalwart at /webmail-api on the shared estate origin (and what that costs); labels are JMAP mailboxes and archive means leaving the Inbox; message HTML only in a sandboxed iframe; tokens in memory only; the house stack. Read before proposing to change any of these.
- [wiki/design.md](wiki/design.md) - How Postern looks and behaves. Gmail's familiar layout (top bar with search, left navigation with Compose, conversation list, reading pane, floating composer) in Postern's own visual identity, never Google's colours, logo or wordmark; light and dark themes, three densities, reading-pane modes, phone layout, motion and accessibility targets. Read before any UI brief; impeccable works within it.
- [wiki/glossary.md](wiki/glossary.md) - Postern's vocabulary, one canonical word per concept with the synonyms it replaces, mapping Gmail's words (what the UI says) to JMAP's (what the jmap package says). Conversation, message, label, system label, Inbox, archive, All Mail, star, Spam, draft, composer, identity, snippet, reading pane, keyword, mailbox. Use these words in code, UI copy and briefs.
- [wiki/gmail-on-jmap.md](wiki/gmail-on-jmap.md) - Which Gmail feature maps to which JMAP object or method on Stalwart 0.16, and whether it is native, client-side, needs checking, or impossible without server work. Conversations, labels and archive, stars and unread, search operators, drafts and sending, undo send, signatures, vacation, filters, spam, contacts, push, attachments, quota, and the Gmail features deferred to todos. Read before writing or working any feature brief.
- [wiki/open-questions.md](wiki/open-questions.md) - Genuinely unresolved questions as of 2026-10-09, each naming the brief that settles it. Whether Stalwart needs Postern registered as an OAuth client; staying signed in across reloads without storing tokens; where per-user display settings and label colours live; whether Stalwart's spam filter learns from Report spam; whether an offline cache is acceptable on the shared origin. Delete an entry the moment it is answered.
- [wiki/overview.md](wiki/overview.md) - What Postern is in a paragraph. A Gmail-like webmail for the owner's own mail on gandolh.ro, a static web app at gandolh.ro/webmail that talks JMAP to the estate's Stalwart server, with no backend of its own. Who uses it, what it copies from Gmail, what it leaves out, and where the other pieces live.
- [wiki/security.md](wiki/security.md) - Postern's threat model and the rules that answer it. Untrusted message content (HTML, links, remote images, attachments, spoofed senders), the shared gandolh.ro origin, token handling, the sandboxed-iframe rendering rule and why CSP inheritance makes "show images" work, the CSP for /webmail, and the malicious-mail test corpus. Read before touching message rendering, sign-in, storage or headers.
- [wiki/status.md](wiki/status.md) - Snapshot as of 2026-10-09. Nothing built; 18 briefs filed in five waves (foundations, reading, writing and organising, live and settings, hardening and deploy), one line each with dependencies; four Gmail features parked as todos. The order briefs run in.

<!-- END CATALOG -->

## Work

- Brief states and the order they run in live in [wiki/status.md](wiki/status.md).
  Specs are in [briefs/](briefs/), captured ideas in [todos/](todos/).
