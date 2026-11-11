# Postern

A webmail client for Stalwart, built on JMAP: a plain-TypeScript client (`jmap/`) and a React app
(`web/`), no server of our own. Read [corpus/index.md](corpus/index.md) first.

## Commands

- `npm run dev`: the app. It needs `npm run dev:mail` (the local Stalwart) and `npm run dev:seed` first.
- `npm run check`: typecheck, lint, format check, conventions, tests. Run it before every hand-back.
- `npm run check:fast`: `tsc -b`, `tsc -p web --noEmit`, then ESLint on the changed files. The Stop hook runs it.
- `npx vitest run <file>`: one test file.
- `npm run test:e2e`: Playwright. It builds, and needs Docker.
- `npm run format`: Prettier writes every file it covers (Markdown stays out).

## Places that mislead

- `npm run typecheck` is six `tsc` runs: `tsc -b`, the JMAP tests, `web`, the web tests, `dev` and `web/e2e`.
- The integration tests (`jmap/test/integration`, `web/test/integration`) skip without the local Stalwart
  and `dev/.env`. So `npm run check` is not the whole gate unless `npm run dev:mail` is running: a green
  run can mean those tests did not run.
- Node 24 is required (`engines` in `package.json`).
- `vendor/house-style/` is a generated copy. Never edit it; `npm run house-style:sync` refreshes it.
- The `jmap` workspace must not import `web` (an ESLint rule).

## Hard rules

- **No secrets.** Never write a password, token or key into the corpus or the repo. Name a secret by
  its file and key, never by its value. Dev-server passwords live in the git-ignored `dev/.env`.
- **Message HTML is rendered only in the sandbox.** Every message body is untrusted. It goes into an
  `<iframe sandbox>` via `srcdoc`, never with `allow-same-origin` or `allow-scripts`, after sanitising,
  with remote content blocked by default. No code path may insert message HTML into the app's own DOM.
  See [corpus/wiki/security.md](corpus/wiki/security.md).
- **The access token lives in memory only; the refresh token may live in `sessionStorage`** (owner,
  2026-10-28), cleared on sign-out and by the idle timeout. Never `localStorage`, IndexedDB or a cookie
  the app's script can read. See [corpus/wiki/decisions.md](corpus/wiki/decisions.md).
- **No backend of our own.** Postern is static files plus Stalwart. A feature that seems to need a
  server is a decision to bring to the owner first.
- **No CI.** Don't add GitHub Actions, runners or other GitHub-specific automation.
- **No pushes.** Commit locally. The owner pushes.
- **Deploys, git hooks and `npm link` are owner steps.** Write the exact commands down and hand them over.
- **Never test against the real mailbox.** Development and tests use the local Stalwart in `dev/`.

## brief-board

Brief progress goes on brief-board. Run `brief-board guide` before you start or resume a brief, and
follow it.
