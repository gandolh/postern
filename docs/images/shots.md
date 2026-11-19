# README images

How each image was made, so the next refresh is a re-run. Re-take an image when the screen it shows changes. All of them show the redesign "The reading desk" of 2026-11-13, in the default light theme.

None of them needs Docker or a mail server. The app is the production build (`npm run build`) under `npx vite preview --port <port> --strictPort` in `web/`. A Playwright script calls `openDesk(page)` from [web/e2e/desk/stub.ts](../../web/e2e/desk/stub.ts) before opening a route: the stub signs a stored session in, answers `/webmail-api` with alice's mail from `dev/seed/`, and freezes the clock at 2026-10-01 10:30 UTC. Every person in the seed is made up, on `postern.test` and `example.*` addresses; no real mailbox and no Ward is involved. The context uses the time zone Europe/Bucharest and blocks service workers. The script lived in a scratch folder; this table is enough to write it again. `SHOTS_DIR=<dir> npx playwright test -c web/e2e/desk/desk.config.ts shots` takes every screen at 1280 and 390 px, light and dark, from the same stub.

PNG to WebP with `ffmpeg -i <file>.png -c:v libwebp -quality 82 <file>.webp`.

| File | Shows | How to reach that state | Viewport | Taken |
|---|---|---|---|---|
| hero.webp | Navigation, the Inbox and "Saturday plans" open in the reading pane | `/#inbox/<thread of "Saturday plans">` | 1440×900 @2x | 2026-11-16 |
| composer.webp | The composer window with a recipient, a subject and a short body | `/#inbox`, click Compose, type `sam.rivera@example.com,` in To, a subject and two lines; clipped to x 852, y 370, 576×530 | 1440×900 @2x, clipped | 2026-11-16 |
| invite-card.webp | The Book club dinner invite card with Yes, No and Maybe | `/#inbox/<thread of "Invitation: Book club">`; clipped to the reading pane, x 704, y 56, 736×520 | 1440×900 @2x, clipped | 2026-11-16 |
| phone-inbox.webp | The Inbox on a phone with the bottom bar and Compose | `/#inbox` | iPhone 14 (Playwright device) | 2026-11-16 |
| phone-conversation.webp | "Saturday plans" on a phone, the newest message open | `/#inbox/<thread of "Saturday plans">`, scrolled to the top | iPhone 14 (Playwright device) | 2026-11-16 |

`desk.threadBySubject("<text>")` returns the thread id for a route.
