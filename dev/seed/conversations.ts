// Conversations with quoted replies: two of 12+ messages in the Inbox, one of
// 22 in All Mail, and short ones shared between alice and bob.

import { ics, pdf, png } from "./mime.ts";
import type { Attachment, MessageSpec } from "./mime.ts";
import { PEOPLE as P, domainOf, escapeHtml, humanDate, paragraphsHtml, seed } from "./people.ts";
import type { Person } from "./people.ts";
import { at, daysBefore } from "./types.ts";
import type { MailboxRef, SeedEmail } from "./types.ts";

interface Turn {
  from: Person;
  to: Person[];
  cc?: Person[];
  at: Date;
  text: string;
  /** Plain text only, as some correspondents send. */
  plain?: boolean;
  attachments?: Attachment[];
  unread?: boolean;
  starred?: boolean;
}

interface Conversation {
  slug: string;
  subject: string;
  turns: Turn[];
  /** Where alice's received copies go. Her own messages go to Sent. */
  alice: MailboxRef[];
  /** Where bob's received copies go, when he is on the thread. */
  bob?: MailboxRef[];
}

/** Replies quote the message before, which quotes the one before: 3 levels at most. */
const QUOTE_DEPTH = 3;

function quotedText(turns: Turn[], i: number, depth = 0): string {
  const t = turns[i] as Turn;
  if (i === 0 || depth >= QUOTE_DEPTH) return t.text;
  const prev = turns[i - 1] as Turn;
  const quoted = quotedText(turns, i - 1, depth + 1)
    .split("\n")
    .map((l) => (l.startsWith(">") ? ">" + l : l === "" ? ">" : "> " + l))
    .join("\n");
  return `${t.text}\n\nOn ${humanDate(prev.at)}, ${prev.from.name} <${prev.from.email}> wrote:\n${quoted}`;
}

function quotedHtml(turns: Turn[], i: number, depth = 0): string {
  const t = turns[i] as Turn;
  const own = `<div dir="ltr">\n${paragraphsHtml(t.text)}\n</div>`;
  if (i === 0 || depth >= QUOTE_DEPTH) return own;
  const prev = turns[i - 1] as Turn;
  return (
    `${own}\n<br>\n<div class="gmail_quote">\n<div dir="ltr" class="gmail_attr">On ${humanDate(prev.at)}, ` +
    `${escapeHtml(prev.from.name)} &lt;<a href="mailto:${prev.from.email}">${prev.from.email}</a>&gt; wrote:<br></div>\n` +
    `<blockquote class="gmail_quote" style="margin:0px 0px 0px 0.8ex;border-left:1px solid rgb(204,204,204);padding-left:1ex">\n` +
    `${quotedHtml(turns, i - 1, depth + 1)}\n</blockquote>\n</div>`
  );
}

function messageIds(c: Conversation): string[] {
  return c.turns.map((t, i) => `${c.slug}.${String(i + 1).padStart(2, "0")}@${domainOf(t.from.email)}`);
}

function conversation(c: Conversation): SeedEmail[] {
  const out: SeedEmail[] = [];
  const ids = messageIds(c);
  c.turns.forEach((t, i) => {
    const spec: MessageSpec = {
      key: `conv/${c.slug}/${i + 1}`,
      from: t.from,
      to: t.to,
      cc: t.cc,
      subject: i === 0 ? c.subject : `Re: ${c.subject}`,
      date: t.at,
      messageId: ids[i] as string,
      inReplyTo: i > 0 ? ids[i - 1] : undefined,
      references: i > 0 ? ids.slice(0, i) : undefined,
      text: quotedText(c.turns, i),
      html: t.plain ? undefined : `<html><body>\n${quotedHtml(c.turns, i)}\n</body></html>`,
      attachments: t.attachments,
    };
    const everyone = [t.from, ...t.to, ...(t.cc ?? [])].map((p) => p.email);
    for (const account of ["alice", "bob"] as const) {
      const me = P[account].email;
      const where = account === "alice" ? c.alice : c.bob;
      if (!where || !everyone.includes(me)) continue;
      const mine = t.from.email === me;
      // The unread and starred marks are alice's; bob has read everything.
      const keywords =
        mine || account === "bob" ? ["$seen"] : [...(t.unread ? [] : ["$seen"]), ...(t.starred ? ["$flagged"] : [])];
      out.push(
        seed(
          { ...spec, key: `${account}/${spec.key}` },
          { account, thread: `conv:${c.slug}`, mailboxes: mine ? ["sent"] : where, keywords },
        ),
      );
    }
  });
  return out;
}

// ---------------------------------------------------------------- the threads

function d(iso: string): Date {
  return at(`${iso}:00Z`);
}

function others(group: Person[], from: Person): Person[] {
  return group.filter((p) => p !== from);
}

function roadmap(): Conversation {
  const team = [P.alice, P.bob, P.carol, P.dave];
  const t = (from: Person, when: string, text: string, extra: Partial<Turn> = {}): Turn => ({
    from,
    to: others(team, from),
    at: d(`2026-09-${when}`),
    text,
    ...extra,
  });
  return {
    slug: "q4-roadmap",
    subject: "Q4 roadmap review",
    alice: ["inbox", "label:Work"],
    bob: ["inbox"],
    turns: [
      t(P.carol, "14T08:12", "Hi all,\n\nAhead of Thursday, here is where the Q4 roadmap stands. Three themes: the launch site, the illustration set, and the onboarding emails.\n\nCan each of you flag what you think is at risk?\n\nCarol", { starred: true }),
      t(P.alice, "14T09:40", "Thanks Carol. The onboarding emails worry me: the copy is not signed off and nobody owns the templates.\n\nAlice"),
      t(P.bob, "14T11:05", "I can own the templates if Dave can give me two days of illustration time in October.\n\nBob"),
      t(P.dave, "14T16:30", "Two days in the week of the 12th works. Before that I'm on the launch site hero images.", { plain: true }),
      t(P.carol, "15T07:55", "Great, that settles onboarding. Launch site next: are we still on for the 3rd of November?"),
      t(P.alice, "15T10:20", "The 3rd is tight but possible if the terms page is approved this week. I've asked again."),
      t(P.bob, "16T09:00", "Terms page approved with two edits. I've applied them."),
      t(P.dave, "17T14:45", "Hero images are in the shared folder. Three options; I'd go with B.", { plain: true }),
      t(P.carol, "18T08:30", "B for me too. Alice, Bob?"),
      t(P.alice, "18T09:02", "B. The colours in A fight the logo."),
      t(P.bob, "21T10:15", "B it is. One more thing for the review: budget. We are 6% over on illustration because of the extra set."),
      t(P.carol, "22T12:00", "6% is fine if we drop the animated banner. Agreed?"),
      t(P.dave, "28T17:20", "Agreed on dropping the banner. I'll send the final illustration list on Monday.", { plain: true, unread: true }),
      t(P.carol, "29T08:05", "Thanks everyone. The final roadmap is on the calendar invite for Thursday; see you there.\n\nCarol", { unread: true }),
    ],
  };
}

const LISBON_ICS = ics("PUBLISH", {
  uid: "lisbon-wednesday-2026@example.net",
  summary: "Lisbon: tram 28 and an Alfama walk",
  location: "Martim Moniz, Lisbon",
  description: "Meet at the tram stop. Hiro brings the camera.",
  start: at("2026-05-13T09:30:00Z"),
  end: at("2026-05-13T13:00:00Z"),
  organizer: P.erin,
  attendees: [P.alice, P.hiro],
  stamp: at("2026-04-02T10:00:00Z"),
});

function lisbon(): Conversation {
  const trio = [P.alice, P.erin, P.hiro];
  const t = (from: Person, when: string, text: string, extra: Partial<Turn> = {}): Turn => ({
    from,
    to: others(trio, from),
    at: d(`2026-${when}`),
    text,
    ...extra,
  });
  return {
    slug: "lisbon-trip",
    subject: "Lisbon in May?",
    alice: ["inbox", "label:Travel"],
    turns: [
      t(P.erin, "03-02T19:10", "Hello you two! Flights to Lisbon are cheap in the week of the 11th of May. Shall we?"),
      t(P.hiro, "03-02T21:45", "Yes! I have leave that week. Alfama, pastéis de nata, the lot."),
      t(P.alice, "03-03T07:30", "I'm in. The 12th to the 17th suits me best."),
      t(P.erin, "03-03T12:00", "12th to 17th then. I'll look at flats near Graça."),
      t(P.erin, "03-05T18:20", "Found two flats. One has a terrace, one has a lift. Votes?"),
      t(P.hiro, "03-05T19:02", "Terrace. The stairs will do us good."),
      t(P.alice, "03-06T08:15", "Terrace, as long as there is a washing machine."),
      t(P.erin, "03-06T09:40", "Booked the terrace one. Washing machine confirmed."),
      t(P.hiro, "03-20T20:00", "Flights booked: out on the 12th, back on the 17th.", { plain: true }),
      t(P.erin, "04-02T10:05", "A rough plan for the Wednesday is attached as a calendar file: tram 28 in the morning, then a walk through Alfama.", {
        attachments: [{ filename: "lisbon-wednesday.ics", type: "text/calendar", data: LISBON_ICS }],
      }),
      t(P.alice, "04-02T12:30", "Perfect. Can we fit in the tile museum one afternoon?"),
      t(P.hiro, "04-03T07:50", "Tile museum on Friday. And here is what tram 28 looks like, for the excited.", {
        attachments: [{ filename: "tram-28.png", type: "image/png", data: png(160, 120, [250, 204, 21], [220, 38, 38]) }],
      }),
      t(P.erin, "04-03T08:30", "Lovely. See you both at the airport on the 12th!", { starred: true }),
    ],
  };
}

function bookClub(): Conversation {
  const club = [P.alice, P.priya, P.sam, P.noor, P.zoe];
  const lines: Array<[Person, string]> = [
    [P.priya, "Time to pick November's book! Nominations, please. I'll start: The Left Hand of Darkness."],
    [P.sam, "Seconding Le Guin. Also nominating Piranesi."],
    [P.noor, "Piranesi is wonderful but I read it last year. Le Guin from me."],
    [P.zoe, "Could we do something shorter? November is busy. Maybe Small Things Like These?"],
    [P.alice, "Small Things Like These is lovely and short. I'd happily read either."],
    [P.priya, "Tally so far: Le Guin 3, Piranesi 1, Keegan 2."],
    [P.sam, "Withdrawing Piranesi then, to keep it simple."],
    [P.noor, "Could we do Keegan in December? It's set at Christmas, after all."],
    [P.zoe, "Good point. Keegan in December, then."],
    [P.priya, "Done: Le Guin for November, Keegan for December."],
    [P.alice, "Where are we meeting? The café was very loud last time."],
    [P.sam, "Taberna Azul has a back room we could book."],
    [P.priya, "I'll call them. Friday the 6th?"],
    [P.noor, "Friday works."],
    [P.zoe, "Friday is good for me too."],
    [P.alice, "Same. Shall we eat there as well?"],
    [P.priya, "Yes, set menu, 25 each. The back room is booked for 19:00."],
    [P.sam, "Perfect. Discussion questions, anyone?"],
    [P.noor, "I'll bring a few on the Gethenians."],
    [P.zoe, "I'll bring the map from the end papers; it helps."],
    [P.priya, "Sending a calendar invite now."],
    [P.alice, "Got it, thanks Priya. See you all on the 6th."],
  ];
  return {
    slug: "book-club-november",
    subject: "Book club: November pick",
    alice: ["archive"],
    turns: lines.map(([from, text], i) => ({
      from,
      to: others(club, from),
      at: daysBefore(60 - i * 2, 17 + (i % 4), (i * 7) % 60),
      text,
      plain: i % 3 === 1,
    })),
  };
}

function lunch(): Conversation {
  return {
    slug: "lunch",
    subject: "Lunch tomorrow?",
    alice: ["inbox"],
    bob: ["inbox"],
    turns: [
      { from: P.alice, to: [P.bob], at: daysBefore(2, 11, 20), text: "Lunch tomorrow? The new ramen place opened on Mill Street." },
      { from: P.bob, to: [P.alice], at: daysBefore(2, 11, 48), unread: true, text: "Yes please. 12:30?" },
    ],
  };
}

const INVOICE_PDF = pdf("Invoice INV-2026-0142", [
  "Northwind Studio, 12 Harbour Road",
  "Bill to: Alice Archer",
  "",
  "Brand workshop (2 days)            EUR 960.00",
  "Illustration set, 12 pieces        EUR 280.00",
  "",
  "Total due                          EUR 1,240.00",
  "Due date: 15 October 2026",
]);

function invoice(): Conversation {
  return {
    slug: "invoice-0142",
    subject: "Invoice INV-2026-0142 from Northwind Studio",
    // In Work, Work/Clients and Receipts at once: the several-labels case.
    alice: ["inbox", "label:Work", "label:Work/Clients", "label:Receipts"],
    turns: [
      {
        from: P.carol,
        to: [P.alice],
        at: daysBefore(5, 14, 2),
        starred: true,
        text: "Hi Alice,\n\nOur invoice for September's workshop and the illustration set is attached. Payment within 14 days, as usual.\n\nBest,\nCarol",
        attachments: [{ filename: "INV-2026-0142.pdf", type: "application/pdf", data: INVOICE_PDF }],
      },
      { from: P.alice, to: [P.carol], at: daysBefore(4, 9, 15), text: "Thanks Carol, paid this morning. Reference INV-2026-0142." },
    ],
  };
}

export const CONVERSATIONS = [roadmap, lisbon, bookClub, lunch, invoice].map((f) => f());

/** The Message-IDs of a conversation, oldest first. */
export function conversationMessageIds(slug: string): string[] {
  const c = CONVERSATIONS.find((x) => x.slug === slug);
  if (!c) throw new Error(`no conversation ${slug}`);
  return messageIds(c);
}

export function conversations(): SeedEmail[] {
  return CONVERSATIONS.flatMap(conversation);
}
