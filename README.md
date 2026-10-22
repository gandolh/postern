# Postern

A webmail for the owner's production domain, in the browser on its own host,
`postern.<domain>`. It looks
and works like Gmail (conversations, labels, search, keyboard shortcuts), and it
talks JMAP to the estate's own Stalwart mail server. There is no backend of its
own: Stalwart is the backend.

A postern is the small side gate in a castle wall.

It is built (briefs 01 to 17) and ready to deploy. The plan, the decisions and
the work queue are in [corpus/](corpus/index.md); start at `corpus/index.md`.

## Deploy

Postern ships through the estate's deploy tool, `../vps-deploy`, like every
other app there. Its stack (`stacks/postern.ts`) runs `npm ci` and
`npm run build` in this checkout (Node 24), then uploads `web/dist`, served
at the root of `postern.<domain>` with the headers in
[corpus/wiki/security-headers.md](corpus/wiki/security-headers.md). Stalwart
answers at `/webmail-api` on the same host, through a route of the mail
stack. The owner runs the deploy; the commands and the smoke test are in
[corpus/wiki/status.md](corpus/wiki/status.md), under Owner steps.
