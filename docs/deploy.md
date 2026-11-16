# Deploy

Postern ships through the estate's deploy tool, `vps-deploy`, and only the owner runs it. Nothing in this repo deploys.

## What the deploy does

`vps-deploy`'s `postern` stack runs `npm ci` and `npm run build` in this repo, then uploads `web/dist`. Caddy serves it at the root of `postern.<domain>` with the headers in [corpus/wiki/security-headers.md](../corpus/wiki/security-headers.md). The same host forwards `/webmail-api` to Stalwart through an allowlisted route in the `mail` stack, so the app and the mail API share one origin.

From the `vps-deploy` checkout:

```bash
node cli.ts postern deploy
```

## Where it stands

- Live since the owner's rollout of 2026-11-02; the smoke test (headers, the routes that must answer 404, sign-in with TOTP, reading, sending with the live update) passed on 2026-11-05.
- On `main` and not deployed yet: the house style and quality harness (2026-11-11), Base UI behind the wrappers (2026-11-12), the move to Tailwind (2026-11-12) and the redesign "The reading desk" (2026-11-13).

After the next deploy, the checks only a person can do (the Stalwart browser suite, a screen reader by ear, the Android install and reload, real push, production's token lifetimes) are listed under Owner steps in [corpus/wiki/status.md](../corpus/wiki/status.md).
