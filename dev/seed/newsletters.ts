// HTML newsletters with remote images. Every image host is a reserved
// example domain: nothing here is meant to load, and Postern blocks remote
// content by default anyway (brief 07).

import { PEOPLE as P, escapeHtml, seed } from "./people.ts";
import type { Person } from "./people.ts";
import { daysBefore } from "./types.ts";
import type { MailboxRef, SeedEmail } from "./types.ts";

interface Newsletter {
  slug: string;
  from: Person;
  subject: string;
  host: string;
  days: number;
  unread: boolean;
  /** Alice's labels for it. Bob, when he gets one, has it in his Inbox. */
  where: MailboxRef[];
  bobToo?: boolean;
  headline: string;
  items: string[];
}

const NEWSLETTERS: Newsletter[] = [
  {
    slug: "weekly-byte-212",
    from: { name: "The Weekly Byte", email: "hello@weeklybyte.example.com" },
    subject: "The Weekly Byte #212: small models, big caches",
    host: "weeklybyte.example.com",
    days: 1,
    unread: true,
    where: ["inbox"],
    bobToo: true,
    headline: "Small models, big caches",
    items: ["Why your cache hit rate lies to you", "A tour of incremental parsers", "Ten years of a boring database"],
  },
  {
    slug: "garden-notes-oct",
    from: { name: "Greenhouse Collective", email: "news@greenhouse.example.org" },
    subject: "Garden Notes: putting the beds to sleep",
    host: "greenhouse.example.org",
    days: 6,
    unread: false,
    where: ["inbox"],
    headline: "Putting the beds to sleep",
    items: ["Mulch now, thank yourself in March", "Garlic goes in this week", "Saving seed from your best tomatoes"],
  },
  {
    slug: "trailhead-sale",
    from: { name: "Trailhead Outfitters", email: "deals@trailhead.example.com" },
    subject: "Up to 30% off trail gear this weekend",
    host: "trailhead.example.com",
    days: 3,
    unread: true,
    where: ["inbox"],
    headline: "The autumn sale is on",
    items: ["Waterproof shells from 89", "Merino base layers, 3 for 2", "Headtorches at half price"],
  },
  {
    slug: "library-november",
    from: { name: "Riverside Library", email: "events@library.example.org" },
    subject: "What's on at the library in November",
    host: "library.example.org",
    days: 9,
    unread: false,
    where: ["inbox"],
    headline: "November at Riverside",
    items: ["Author talk: writing the coast", "Repair café, every Saturday", "Story hour moves to 10:30"],
  },
  {
    slug: "cinema-club",
    from: { name: "Cinema Club", email: "programme@cinema.example.net" },
    subject: "Cinema Club: this month's screenings",
    host: "cinema.example.net",
    days: 20,
    unread: false,
    where: ["archive"],
    headline: "This month's screenings",
    items: ["Tuesday: Stalker (1979)", "Thursday: Paterson", "Sunday matinee: My Neighbour Totoro"],
  },
];

function html(n: Newsletter, user: string): string {
  const img = (path: string, w: number, h: number, alt: string) =>
    `<img src="https://${n.host}/img/${path}" width="${w}" height="${h}" alt="${escapeHtml(alt)}" style="display:block;max-width:100%;border:0">`;
  const items = n.items
    .map(
      (it, i) =>
        `<div class="item">${img(`item-${i + 1}.jpg`, 552, 200, "")}\n` +
        `<h2><a href="https://${n.host}/r/${n.slug}/${i + 1}">${escapeHtml(it)}</a></h2>\n<p>Read the full story on our site.</p></div>`,
    )
    .join("\n");
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${escapeHtml(n.subject)}</title>
<style>
body { margin: 0; background: #f4f4f5; font-family: Georgia, serif; }
.wrap { max-width: 600px; margin: 0 auto; background: #ffffff; }
.item { padding: 16px 24px; border-top: 1px solid #e4e4e7; }
h1 { font-size: 26px; margin: 0; padding: 24px; }
a { color: #1d4ed8; }
</style></head>
<body>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<div class="wrap">
${img("logo.png", 600, 120, n.from.name)}
<h1>${escapeHtml(n.headline)}</h1>
${img("hero.jpg", 600, 300, "")}
${items}
<p style="font-size:12px;color:#71717a;padding:24px">You are receiving this because you subscribed at ${n.host}.
<a href="https://${n.host}/unsubscribe?u=${user}">Unsubscribe</a>.</p>
<img src="https://${n.host}/open.gif?u=${user}&amp;c=${n.slug}" width="1" height="1" alt="">
</div></td></tr></table>
</body></html>`;
}

function text(n: Newsletter, user: string): string {
  const items = n.items.map((it, i) => `* ${it}\n  https://${n.host}/r/${n.slug}/${i + 1}`).join("\n\n");
  return `${n.headline}\n\n${items}\n\nUnsubscribe: https://${n.host}/unsubscribe?u=${user}\n`;
}

export function newsletters(): SeedEmail[] {
  const out: SeedEmail[] = [];
  for (const n of NEWSLETTERS) {
    for (const account of n.bobToo ? (["alice", "bob"] as const) : (["alice"] as const)) {
      out.push(
        seed(
          {
            key: `${account}/news/${n.slug}`,
            from: n.from,
            to: [P[account]],
            subject: n.subject,
            date: daysBefore(n.days, 6, 30),
            messageId: `${n.slug}@${n.host}`,
            text: text(n, account),
            html: html(n, account),
            headers: [
              ["List-Unsubscribe", `<https://${n.host}/unsubscribe?u=${account}>, <mailto:unsubscribe@${n.host}>`],
              ["List-Unsubscribe-Post", "List-Unsubscribe=One-Click"],
              ["List-Id", `${n.from.name} <news.${n.host}>`],
              ["Precedence", "bulk"],
            ],
          },
          {
            account,
            mailboxes: account === "alice" ? n.where : ["inbox"],
            keywords: n.unread && account === "alice" ? [] : ["$seen"],
          },
        ),
      );
    }
  }
  return out;
}
