# Task 03: The JMAP client

## Context

`@postern/jmap` is the only code that speaks JMAP. The UI depends on its types
and functions, never on raw method calls. See
[architecture.md](../../wiki/architecture.md) for session rebasing and push,
and [gmail-on-jmap.md](../../wiki/gmail-on-jmap.md) for which objects are used.
JMAP words (Mailbox, Thread, Email, keyword) are correct inside this package.

## Files you OWN

- `jmap/src/**`, `jmap/package.json` (add dependencies only if justified, and
  pin them)
- `jmap/test/**`: unit tests with recorded responses, plus integration tests
  against brief 02's server, skipped when it is not running

## What to do

1. **Session.**
   - Fetch `/webmail-api/jmap/session` with a bearer token.
   - Rebase `apiUrl`, `downloadUrl`, `uploadUrl` and `eventSourceUrl` onto the
     configured base (`/webmail-api`), keeping their path and template
     variables.
   - Expose the account ID, capabilities and limits.
2. **Requests.**
   - A request builder that batches method calls in one POST.
   - Back-references (`#ids` with `resultOf`).
   - Typed responses, and method errors mapped to typed errors.
   - Respect `maxCallsInRequest` and `maxObjectsInGet` by splitting.
3. **Methods.**
   - Typed wrappers for `Mailbox`, `Thread`, `Email` (query, get with
     `bodyValues`, set, import, changes, queryChanges) and `SearchSnippet`.
   - `Identity`, `EmailSubmission`, `VacationResponse`, `SieveScript`, `Quota`.
   - `AddressBook` and `ContactCard` stubs, typed but unused until brief 15.
4. **Blobs.** Upload with progress; download URL built from the template;
   `cid:` resolution helper.
5. **State.** A small cache keyed by type and state string that applies
   `/changes` and `/queryChanges` results. It reports `cannotCalculateChanges`
   so the UI can refetch.
6. **Push.** An event-source reader on `fetch()` that sends `Authorization`:
   - parse `text/event-stream` by hand;
   - emit `StateChange` events;
   - reconnect with backoff, and expose a "polling fallback" mode.

   Stalwart rejects the browser `EventSource`, because it cannot send the
   header.

## Acceptance

- Unit tests cover the rebasing, batching, back-references, error mapping and
  the event-stream parser.
- Integration tests against `dev/` cover:
  - list alice's labels; query and get a conversation;
  - star a message and see `Email/changes` report it;
  - upload a blob;
  - receive a `StateChange` over the fetch stream after a change made from a
    second client.
- No DOM or React import anywhere in `jmap/`.

## Outcome (2026-10-20)

Built with no runtime dependencies. Auth is injected (`AuthProvider` with an
`onUnauthorized` retry hook), so tests use Basic auth and brief 04 plugs in
bearer tokens. Uploads take an injectable transport, because `fetch` reports
no upload progress; brief 08 passes an XHR one. 114 unit tests and 15
integration tests against `dev/`, all run. Integration tests undo what they
change; the three small blobs they upload stay until Stalwart purges them.
Findings: the session `state` never moves on mail changes, so the polling
fallback polls the `Email`, `Mailbox` and `Thread` states instead; downloads
need `Authorization`; Stalwart wants `accountId` as the first key in method
arguments. Not checked client-side: `maxSizeRequest`.
