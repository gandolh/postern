// Volume: 2,400 generated conversations for alice, 2,000 in the Inbox and 400
// in All Mail, over the two years before the anchor date, from dozens of
// senders. Most are one message; a few are short exchanges with alice, whose
// replies go to Sent. For list performance
// (brief 06) and date and size searches (brief 10). Seeded PRNG, so every
// run generates the same mail.

import { png, prng, pick } from "./mime.ts";
import type { Address, Attachment } from "./mime.ts";
import { PEOPLE as P, escapeHtml, paragraphsHtml, seed } from "./people.ts";
import { daysBefore } from "./types.ts";
import type { MailboxRef, SeedEmail } from "./types.ts";

/** Conversations, not messages. */
export const BULK_INBOX = 2000;
export const BULK_ARCHIVE = 400;

type Kind = "personal" | "work" | "notification" | "receipt" | "travel" | "digest";

interface Sender extends Address {
  name: string;
  kind: Kind;
}

const FIRST = ["Ana", "Ben", "Chloe", "Diego", "Elif", "Femi", "Greta", "Hamid", "Ines", "Jonas", "Kira", "Luca", "Maya", "Nils", "Olga", "Pavel", "Quinn", "Rosa", "Theo", "Uma", "Vera", "Wim", "Yara", "Zane"];
const LAST = ["Abbott", "Berg", "Costa", "Dunn", "Eriksen", "Fox", "Garcia", "Holm", "Ito", "Jensen", "Klein", "Lund", "Moreno", "Novak", "Ortiz", "Petrov"];
const PERSONAL_DOMAINS = ["example.com", "example.org", "example.net", "mail.example.com", "post.example.org"];

const SERVICES: Sender[] = [
  { name: "Tracker", email: "notifications@tracker.example.com", kind: "notification" },
  { name: "Build Bot", email: "builds@ci.example.org", kind: "notification" },
  { name: "Calendar", email: "calendar@cal.example.net", kind: "notification" },
  { name: "Code Review", email: "reviews@code.example.com", kind: "notification" },
  { name: "Corner Shop", email: "orders@cornershop.example.com", kind: "receipt" },
  { name: "Bookworm Books", email: "orders@bookworm.example.org", kind: "receipt" },
  { name: "City Power", email: "billing@citypower.example.net", kind: "receipt" },
  { name: "Fresh Box", email: "hello@freshbox.example.com", kind: "receipt" },
  { name: "Rail Tickets", email: "tickets@rail.example.org", kind: "travel" },
  { name: "Stayaway Hotels", email: "reservations@stayaway.example.com", kind: "travel" },
  { name: "Hostel Hub", email: "bookings@hostelhub.example.net", kind: "travel" },
  { name: "Morning Brief", email: "brief@morning.example.com", kind: "digest" },
  { name: "Design Digest", email: "digest@design.example.org", kind: "digest" },
  { name: "Neighbourhood Forum", email: "forum@neighbours.example.net", kind: "digest" },
];

function senders(rand: () => number): Sender[] {
  const people: Sender[] = [];
  for (let i = 0; i < 40; i++) {
    const first = FIRST[i % FIRST.length] as string;
    const last = LAST[(i * 7) % LAST.length] as string;
    const domain = PERSONAL_DOMAINS[i % PERSONAL_DOMAINS.length] as string;
    people.push({
      name: `${first} ${last}`,
      email: `${first.toLowerCase()}.${last.toLowerCase()}@${domain}`,
      kind: rand() < 0.4 ? "work" : "personal",
    });
  }
  return [...people, ...SERVICES];
}

const SUBJECTS: Record<Kind, string[]> = {
  personal: ["Catching up", "Saturday plans", "That recipe", "Photos from the weekend", "Birthday drinks", "Quick question", "Book recommendation", "Moving house", "Running club", "Concert tickets"],
  work: ["Notes from today's call", "Budget question", "Draft for review", "Agenda for Tuesday", "Hiring update", "Quarterly numbers", "Feedback on the proposal", "Timeline check", "Vendor shortlist", "Workshop follow-up"],
  notification: ["New comment on issue #{n}", "Build #{n} passed", "Build #{n} failed", "Reminder: stand-up at 10:00", "Review requested on change #{n}", "Issue #{n} was closed", "You were mentioned in #{n}"],
  receipt: ["Your order #{n} has shipped", "Receipt for order #{n}", "Your bill for this month", "Delivery scheduled for order #{n}", "Refund processed for order #{n}"],
  travel: ["Booking confirmed: reference {n}", "Your journey on the {d}th", "Check-in is open", "Your stay: reservation {n}", "Seat reservation {n}"],
  digest: ["Your weekly digest", "Top stories this week", "Ten things worth reading", "New in the forum this week", "This week's highlights"],
};

const SENTENCES: Record<Kind, string[]> = {
  personal: ["Hope you are well.", "It has been far too long.", "Are you free at the weekend?", "The weather here has finally turned.", "I found the book you mentioned in a second-hand shop.", "Let me know what suits you.", "We should do this more often.", "The kids say hello.", "I am still laughing about last time.", "Bring a jumper, it gets cold by the river."],
  work: ["Following up on our conversation.", "The numbers are in the attached sheet.", "Could you take a look before Friday?", "I have pencilled in an hour on Tuesday.", "Two open questions remain.", "Happy to discuss on a call.", "The vendor needs an answer this week.", "Let us keep the scope as agreed.", "I have updated the timeline accordingly.", "Thanks for the quick turnaround."],
  notification: ["This is an automated message.", "Open the link to see the full discussion.", "You are receiving this because you are watching this project.", "No action is needed.", "The change is ready for review.", "All checks have completed."],
  receipt: ["Thank you for your order.", "Your items are on their way.", "Keep this email for your records.", "Delivery usually takes two to three working days.", "The total includes VAT.", "Questions? Reply to this email."],
  travel: ["Please arrive in good time.", "Your reference is shown above.", "Check-in opens 24 hours before departure.", "Breakfast is included.", "Show this email at the desk.", "Free cancellation until 48 hours before arrival."],
  digest: ["Here is what happened this week.", "The most-read story was about tiny houses.", "Members posted 42 new topics.", "Read on for our editors' picks.", "Thanks for reading, as always.", "Reply to tell us what you would like more of."],
};

function body(rand: () => number, kind: Kind, paragraphs: number): string {
  const out: string[] = [];
  for (let p = 0; p < paragraphs; p++) {
    const n = 2 + Math.floor(rand() * 4);
    out.push(Array.from({ length: n }, () => pick(rand, SENTENCES[kind])).join(" "));
  }
  return out.join("\n\n");
}

function subjectFor(rand: () => number, kind: Kind): string {
  return pick(rand, SUBJECTS[kind])
    .replace("{n}", String(1000 + Math.floor(rand() * 9000)))
    .replace("{d}", String(4 + Math.floor(rand() * 24)));
}

function extraLabel(rand: () => number, kind: Kind): MailboxRef[] {
  if (kind === "work" && rand() < 0.3) return ["label:Work"];
  if (kind === "receipt") return ["label:Receipts"];
  if (kind === "travel") return rand() < 0.5 ? ["label:Travel", "label:Receipts"] : ["label:Travel"];
  return [];
}

export function bulk(): SeedEmail[] {
  const rand = prng(0x5eed2026);
  const from = senders(rand);
  const out: SeedEmail[] = [];

  for (let i = 0; i < BULK_INBOX + BULK_ARCHIVE; i++) {
    const home: MailboxRef = i < BULK_INBOX ? "inbox" : "archive";
    const sender = pick(rand, from);
    const kind = sender.kind;
    const day = 1 + Math.floor(rand() * 729);
    const start = daysBefore(day, 6 + Math.floor(rand() * 15), Math.floor(rand() * 60));
    const subject = subjectFor(rand, kind);
    // Every so often a short conversation between the sender and alice.
    const replies = (kind === "personal" || kind === "work") && rand() < 0.08 ? 1 + Math.floor(rand() * 3) : 0;
    const length = 1 + replies;
    const labels = [home, ...extraLabel(rand, kind)];
    const domain = sender.email.slice(sender.email.indexOf("@") + 1);
    const ids: string[] = [];
    const thread = `bulk:${i}`;

    for (let r = 0; r < length; r++) {
      const fromAlice = r % 2 === 1;
      const author = fromAlice ? P.alice : sender;
      const id = `bulk.${i}.${r}@${fromAlice ? "postern.test" : domain}`;
      const date = new Date(start.getTime() + r * (3 + Math.floor(rand() * 20)) * 3_600_000);
      const paragraphs = rand() < 0.05 ? 20 + Math.floor(rand() * 30) : 1 + Math.floor(rand() * 6);
      const text = `${fromAlice ? "Hi" : "Hello"} ${fromAlice ? sender.name.split(" ")[0] : "Alice"},\n\n${body(rand, kind, paragraphs)}\n\n${author.name.split(" ")[0]}`;
      const htmlish = kind === "notification" || kind === "receipt" || kind === "travel" || kind === "digest";
      const attach: Attachment[] = [];
      if (!fromAlice && rand() < 0.04) {
        attach.push(
          rand() < 0.5
            ? { filename: `notes-${i}.txt`, type: "text/plain", data: body(rand, kind, 3) }
            : { filename: `chart-${i}.png`, type: "image/png", data: png(64, 48, [Math.floor(rand() * 255), 90, 160], [240, Math.floor(rand() * 255), 120]) },
        );
      }
      const unread = !fromAlice && rand() < (day < 30 ? 0.4 : 0.04);
      const starred = !fromAlice && rand() < 0.03;
      out.push(
        seed(
          {
            key: `alice/bulk/${i}/${r}`,
            from: author,
            to: [fromAlice ? sender : P.alice],
            subject: r === 0 ? subject : `Re: ${subject}`,
            date,
            messageId: id,
            inReplyTo: r > 0 ? ids[r - 1] : undefined,
            references: r > 0 ? [...ids] : undefined,
            text,
            html: htmlish
              ? `<html><body style="font-family:sans-serif"><h2>${escapeHtml(subject)}</h2>\n${paragraphsHtml(text)}\n</body></html>`
              : undefined,
            attachments: attach.length ? attach : undefined,
          },
          {
            account: "alice",
            thread,
            mailboxes: fromAlice ? ["sent"] : labels,
            keywords: [...(unread ? [] : ["$seen"]), ...(starred ? ["$flagged"] : [])],
          },
        ),
      );
      ids.push(id);
    }
  }
  return out;
}
