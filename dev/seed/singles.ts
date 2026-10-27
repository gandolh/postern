// One-message conversations: attachments (inline cid: images, PDF, PNG,
// iCalendar, a ~5 MB CSV), international text, plain text, alice's Sent,
// drafts, Spam and Trash, and bob's small mailbox.

import { ics, largeCsv, pdf, png } from "./mime.ts";
import type { Address, MessageSpec } from "./mime.ts";
import { conversationMessageIds } from "./conversations.ts";
import { PEOPLE as P, seed } from "./people.ts";
import { at, daysBefore } from "./types.ts";
import type { MailboxRef, SeedEmail } from "./types.ts";

/** The large attachment's size in bytes (at least). */
export const LARGE_ATTACHMENT_BYTES = 5_000_000;
export const LARGE_MESSAGE_ID = "survey-export@okafor.example.org";
export const INLINE_IMAGES_MESSAGE_ID = "offsite-photos@postern.test";

function attachments(): SeedEmail[] {
  const out: SeedEmail[] = [];

  // From bob, with inline cid: images and an attachment (`from:bob has:attachment`).
  const offsite: MessageSpec = {
    key: "offsite",
    from: P.bob,
    to: [P.alice],
    subject: "Photos from the offsite",
    date: daysBefore(7, 15, 40),
    messageId: INLINE_IMAGES_MESSAGE_ID,
    text: "Two favourites from the offsite are inline below; the group photo is attached.\n\nBob",
    html:
      "<html><body><div dir=\"ltr\"><p>Two favourites from the offsite:</p>\n" +
      '<p><img src="cid:offsite-1@postern.test" alt="The lake at dawn" width="240" height="160"></p>\n' +
      '<p><img src="cid:offsite-2@postern.test" alt="The boathouse at sunset" width="240" height="160"></p>\n' +
      "<p>The group photo is attached.</p><p>Bob</p></div></body></html>",
    inline: [
      { filename: "lake.png", type: "image/png", data: png(240, 160, [14, 116, 144], [134, 239, 172]), contentId: "offsite-1@postern.test" },
      { filename: "boathouse.png", type: "image/png", data: png(240, 160, [91, 33, 182], [251, 146, 60]), contentId: "offsite-2@postern.test" },
    ],
    attachments: [{ filename: "group-photo.png", type: "image/png", data: png(320, 200, [190, 18, 60], [253, 224, 71]) }],
  };
  out.push(seed({ ...offsite, key: "alice/offsite" }, { account: "alice", mailboxes: ["inbox"], keywords: ["$seen", "$flagged"] }));
  out.push(seed({ ...offsite, key: "bob/offsite" }, { account: "bob", mailboxes: ["sent"] }));

  const contract: MessageSpec = {
    key: "contract",
    from: P.bob,
    to: [P.alice],
    cc: [P.carol],
    subject: "Contract draft v3 for Northwind",
    date: daysBefore(10, 10, 5),
    messageId: "contract-v3@postern.test",
    text: "Alice,\n\nv3 of the Northwind agreement is attached. The changes are in clauses 7 and 9.\n\nBob",
    attachments: [
      {
        filename: "northwind-agreement-v3.pdf",
        type: "application/pdf",
        data: pdf("Services agreement, draft v3", [
          "Between Postern Test Ltd and Northwind Studio.",
          "1. Scope: design and illustration for the Q4 launch.",
          "2. Term: 1 October 2026 to 31 March 2027.",
          "3. Fees: as per schedule A, invoiced monthly.",
          "4. Changes since v2: clause 7 (IP) and clause 9 (notice).",
        ]),
      },
    ],
  };
  out.push(seed({ ...contract, key: "alice/contract" }, { account: "alice", mailboxes: ["inbox", "label:Work", "label:Work/Clients"], keywords: [] }));
  out.push(seed({ ...contract, key: "bob/contract" }, { account: "bob", mailboxes: ["sent"] }));

  // A calendar invitation: the iCalendar as an alternative part and as a file.
  const event = ics("REQUEST", {
    uid: "book-club-2026-11-06@example.org",
    summary: "Book club dinner",
    location: "Taberna Azul, 4 Quay Street",
    description: "November pick: The Left Hand of Darkness. Bring your notes.",
    start: at("2026-11-06T19:00:00Z"),
    end: at("2026-11-06T22:00:00Z"),
    organizer: P.priya,
    attendees: [P.alice, P.sam, P.noor],
    stamp: daysBefore(3, 18, 2),
  });
  out.push(
    seed(
      {
        key: "alice/book-club-invite",
        from: P.priya,
        to: [P.alice, P.sam, P.noor],
        subject: "Invitation: Book club dinner, Fri 6 Nov 2026 19:00 (UTC)",
        date: daysBefore(3, 18, 2),
        messageId: "book-club-invite@example.org",
        text: "Book club dinner\nFriday 6 November 2026, 19:00 to 22:00 (UTC)\nTaberna Azul, 4 Quay Street\n\nNovember pick: The Left Hand of Darkness.",
        html: "<html><body><h2>Book club dinner</h2><p>Friday 6 November 2026, 19:00 to 22:00 (UTC)<br>Taberna Azul, 4 Quay Street</p><p>November pick: <em>The Left Hand of Darkness</em>.</p></body></html>",
        calendar: { method: "REQUEST", ics: event },
        attachments: [{ filename: "invite.ics", type: "application/ics", data: event }],
      },
      { account: "alice", mailboxes: ["inbox"], keywords: [] },
    ),
  );

  // Brief 25: an iMIP REQUEST and a CANCEL between the two dev accounts, so a
  // REPLY reaches an organiser's mailbox the tests can read. The REQUEST's
  // times are in Lisbon's zone (10:00 there is 10:00 UTC in November).
  const planning = ics("REQUEST", {
    uid: "q1-planning-2026-11-05@postern.test",
    summary: "Q1 planning",
    location: "Room 2, third floor",
    description: "Bring the numbers for the first quarter.",
    start: at("2026-11-05T10:00:00Z"),
    end: at("2026-11-05T11:30:00Z"),
    zone: { tzid: "Europe/Lisbon", start: "20261105T100000", end: "20261105T113000" },
    organizer: P.bob,
    attendees: [P.alice],
    stamp: daysBefore(1, 16, 40),
    sequence: 0,
  });
  out.push(
    seed(
      {
        key: "alice/planning-invite",
        from: P.bob,
        to: [P.alice],
        subject: "Invitation: Q1 planning, Thu 5 Nov 2026 10:00 (Lisbon)",
        date: daysBefore(1, 16, 40),
        messageId: "q1-planning-invite@postern.test",
        text: "Q1 planning\nThursday 5 November 2026, 10:00 to 11:30 (Lisbon)\nRoom 2, third floor\n\nBring the numbers for the first quarter.",
        calendar: { method: "REQUEST", ics: planning },
      },
      { account: "alice", mailboxes: ["inbox"], keywords: [] },
    ),
  );
  const retro = ics("CANCEL", {
    uid: "retro-2026-10-30@postern.test",
    summary: "Sprint retro",
    location: "Room 4",
    description: "Cancelled: we'll fold it into Q1 planning.",
    start: at("2026-10-30T14:00:00Z"),
    end: at("2026-10-30T15:00:00Z"),
    organizer: P.bob,
    attendees: [P.alice],
    stamp: daysBefore(1, 16, 45),
    sequence: 1,
    status: "CANCELLED",
  });
  out.push(
    seed(
      {
        key: "alice/retro-cancelled",
        from: P.bob,
        to: [P.alice],
        subject: "Cancelled: Sprint retro, Fri 30 Oct 2026 14:00 (UTC)",
        date: daysBefore(1, 16, 45),
        messageId: "retro-cancelled@postern.test",
        text: "Sprint retro on Friday 30 October is cancelled: we'll fold it into Q1 planning.",
        calendar: { method: "CANCEL", ics: retro },
      },
      { account: "alice", mailboxes: ["inbox"], keywords: [] },
    ),
  );

  // The large one, for `larger:` searches and download progress. Built only
  // when imported.
  out.push(
    seed(
      {
        key: "alice/survey-export",
        from: P.dave,
        to: [P.alice],
        subject: "Survey measurements, full export",
        date: daysBefore(16, 13, 25),
        messageId: LARGE_MESSAGE_ID,
        text: "Alice, the full export from the summer survey is attached (about 5 MB of CSV). Shout if the columns need explaining.\n\nDave",
        get attachments() {
          return [{ filename: "survey-2026-full.csv", type: "text/csv", data: largeCsv(LARGE_ATTACHMENT_BYTES, 20261001) }];
        },
      },
      { account: "alice", mailboxes: ["inbox", "label:Work"] },
    ),
  );

  // A booking, archived: in Receipts and Travel, not in the Inbox.
  out.push(
    seed(
      {
        key: "alice/eticket",
        from: { name: "SkyLark Air", email: "bookings@skylark.example.com" },
        to: [P.alice],
        subject: "Your e-ticket: Lisbon to Amsterdam, booking SKY-7QX2LM",
        date: at("2026-03-20T19:58:00Z"),
        messageId: "sky-7qx2lm@skylark.example.com",
        text: "Booking SKY-7QX2LM is confirmed. Your e-ticket is attached.\n\nSK 2231 LIS-AMS 12 May 2026 07:40\nSK 2236 AMS-LIS 17 May 2026 18:15",
        html:
          '<html><body><table><tr><td><img src="https://skylark.example.com/img/logo.png" width="120" height="40" alt="SkyLark Air"></td></tr>' +
          "<tr><td><h2>Booking SKY-7QX2LM is confirmed</h2><p>SK 2231 LIS&rarr;AMS, 12 May 2026 07:40<br>SK 2236 AMS&rarr;LIS, 17 May 2026 18:15</p></td></tr></table></body></html>",
        attachments: [
          {
            filename: "eticket-SKY-7QX2LM.pdf",
            type: "application/pdf",
            data: pdf("E-ticket SKY-7QX2LM", [
              "Passenger: ARCHER/ALICE",
              "SK 2231  Lisbon (LIS) -> Amsterdam (AMS)  12 May 2026 07:40",
              "SK 2236  Amsterdam (AMS) -> Lisbon (LIS)  17 May 2026 18:15",
              "Baggage: 1 x 23 kg",
            ]),
          },
        ],
      },
      { account: "alice", mailboxes: ["label:Receipts", "label:Travel"] },
    ),
  );
  return out;
}

function international(): SeedEmail[] {
  return [
    seed(
      {
        key: "alice/zoe-cafe",
        from: P.zoe,
        to: [P.alice],
        subject: "Café-Treffen am Samstag? ☕",
        date: daysBefore(1, 17, 12),
        messageId: "cafe-samstag@mueller.example.com",
        text: "Hallo Alice,\n\nhast du am Samstag Zeit für einen Kaffee? Ich kenne ein schönes Café an der Brücke, mit Käsekuchen und größeren Tischen.\n\nGrüße,\nZoë",
      },
      { account: "alice", mailboxes: ["inbox"], keywords: [] },
    ),
    seed(
      {
        key: "alice/hiro-meeting",
        from: P.hiro,
        to: [P.alice],
        subject: "来週の打ち合わせについて",
        date: daysBefore(8, 2, 30),
        messageId: "uchiawase@tanaka.example.net",
        text: "アリスさん\n\n来週の打ち合わせは水曜日の午後三時からでいかがでしょうか。\n資料は前日までにお送りします。\n\nよろしくお願いいたします。\n田中",
        html: "<html><body><p>アリスさん</p><p>来週の打ち合わせは<b>水曜日の午後三時</b>からでいかがでしょうか。<br>資料は前日までにお送りします。</p><p>よろしくお願いいたします。<br>田中</p></body></html>",
      },
      { account: "alice", mailboxes: ["inbox"] },
    ),
    seed(
      {
        key: "alice/noor-wedding",
        from: P.noor,
        to: [P.alice],
        subject: "مرحبا! Photos from the wedding",
        date: daysBefore(14, 20, 45),
        messageId: "wedding-photos@haddad.example.org",
        text: "مرحبا أليس،\nشكرا لحضورك حفل الزفاف.\n\nHi Alice, thank you for coming! The photos are at https://photos.haddad.example.org/wedding\n\nنور",
        html:
          '<html><body><div dir="rtl" lang="ar"><p>مرحبا أليس،</p><p>شكرا لحضورك حفل الزفاف.</p></div>' +
          '<div dir="ltr"><p>Hi Alice, thank you for coming! The photos are at <a href="https://photos.haddad.example.org/wedding">photos.haddad.example.org</a>.</p></div>' +
          '<div dir="rtl"><p>نور</p></div></body></html>',
      },
      { account: "alice", mailboxes: ["inbox"], keywords: ["$seen", "$flagged"] },
    ),
  ];
}

interface Simple {
  slug: string;
  from: Address;
  to: Address[];
  subject: string;
  text: string;
  date: Date;
  mailboxes: MailboxRef[];
  keywords?: string[];
}

function simple(account: SeedEmail["account"], s: Simple): SeedEmail {
  const domain = s.from.email.slice(s.from.email.indexOf("@") + 1);
  return seed(
    { key: `${account}/${s.slug}`, from: s.from, to: s.to, subject: s.subject, date: s.date, messageId: `${s.slug}@${domain}`, text: s.text },
    { account, mailboxes: s.mailboxes, keywords: s.keywords },
  );
}

const ALICE_PLAIN: Simple[] = [
  { slug: "sam-climbing", from: P.sam, to: [P.alice], subject: "Climbing on Thursday?", text: "The wall has a new set of routes. Thursday at 7?\n\nSam", date: daysBefore(0, 8, 10), mailboxes: ["inbox"], keywords: [] },
  { slug: "marta-boiler", from: P.marta, to: [P.alice], subject: "Boiler service on the 14th", text: "Dear Alice,\n\nThe engineer will service the boiler on the 14th between 9 and 12. Please make sure someone is in.\n\nKind regards,\nMarta Kowalski\nLettings", date: daysBefore(11, 9, 0), mailboxes: ["inbox"] },
  { slug: "parcel-locker", from: { name: "Parcel Lockers", email: "noreply@lockers.example.com" }, to: [P.alice], subject: "Your parcel is ready to collect", text: "Your parcel is in locker 14 at Mill Street station.\nCollect within 72 hours.", date: daysBefore(4, 16, 45), mailboxes: ["inbox"] },
  { slug: "erin-postcard", from: P.erin, to: [P.alice], subject: "A postcard from Porto", text: "Porto is all hills and tiles. I thought of our Lisbon week the whole time.\n\nE.", date: daysBefore(25, 19, 30), mailboxes: ["archive"] },
  { slug: "dave-rates", from: P.dave, to: [P.alice], subject: "Day rates for 2027", text: "Hi Alice,\n\nMy day rate goes up 5% from January. Happy to talk it through.\n\nDave", date: daysBefore(33, 10, 0), mailboxes: ["label:Work"] },
];

/** Alice writes to people she has no other mail from: Other contacts (brief 15). */
const ALICE_SENT: Simple[] = [
  { slug: "to-erin-photos", from: P.alice, to: [P.erin], subject: "Lisbon photos", text: "Erin, my Lisbon photos are in the shared album now. The terrace sunset came out well.", date: daysBefore(130, 20, 0), mailboxes: ["sent"] },
  { slug: "to-marta-keys", from: P.alice, to: [P.marta], subject: "Spare keys", text: "Hi Marta, could you post the spare keys? The ones I have stick in the lock.", date: daysBefore(40, 8, 30), mailboxes: ["sent"] },
  { slug: "to-plumber", from: P.alice, to: [{ name: "FixIt Plumbing", email: "info@fixit.example.com" }], subject: "Leaking kitchen tap", text: "Hello, the kitchen tap drips constantly. Could someone come this week?", date: daysBefore(55, 7, 45), mailboxes: ["sent"] },
  { slug: "to-clinic", from: P.alice, to: [{ name: "Riverside Clinic", email: "appointments@clinic.example.org" }], subject: "Moving my appointment", text: "Could I move my appointment on the 3rd to the following week?", date: daysBefore(70, 9, 5), mailboxes: ["sent"] },
  { slug: "to-gina", from: P.alice, to: [{ name: "Gina Rossi", email: "gina.rossi@example.com" }], subject: "Recipe, as promised", text: "Gina, here is the lentil soup recipe: lentils, onion, cumin, lemon. Lots of lemon.", date: daysBefore(95, 18, 20), mailboxes: ["sent"] },
  { slug: "to-tomasz", from: P.alice, to: [{ name: "Tomasz Nowak", email: "tomasz@nowak.example.net" }], subject: "Bike for sale", text: "Hi Tomasz, is the blue bike still for sale? I could come by on Saturday.", date: daysBefore(210, 12, 0), mailboxes: ["sent"] },
  { slug: "to-bob-slides", from: P.alice, to: [P.bob], subject: "Slides for Thursday", text: "Bob, the slides for Thursday are in the shared folder. Comments welcome.", date: daysBefore(15, 17, 0), mailboxes: ["sent"] },
  { slug: "to-priya-book", from: P.alice, to: [P.priya], subject: "Borrowing your copy", text: "Priya, could I borrow your copy of the Le Guin? Mine has vanished.", date: daysBefore(45, 21, 10), mailboxes: ["sent"] },
];

/** Obvious, harmless junk for the Spam label. */
const ALICE_SPAM: Simple[] = [
  { slug: "spam-socks", from: { name: "Prize Desk", email: "prizes@lucky.example.net" }, to: [P.alice], subject: "You have won a lifetime supply of socks!!!", text: "CONGRATULATIONS! Reply now to claim your socks. Offer ends soon!!!", date: daysBefore(2, 3, 14), mailboxes: ["junk"], keywords: ["$junk"] },
  { slug: "spam-gnomes", from: { name: "Gnome Emporium", email: "sale@gnomes.example.org" }, to: [P.alice], subject: "Garden gnomes, 90% off, today only", text: "Every gnome must go. Bulk discounts for 50 gnomes or more.", date: daysBefore(5, 4, 2), mailboxes: ["junk"], keywords: ["$junk"] },
  { slug: "spam-seo", from: { name: "Rank Wizard", email: "hello@rankwizard.example.com" }, to: [P.alice], subject: "Re: your website ranking", text: "Dear website owner, we can put you on page one of every search engine by Friday.", date: daysBefore(9, 2, 50), mailboxes: ["junk"], keywords: ["$junk", "$seen"] },
  { slug: "spam-timeshare", from: { name: "Sunny Shares", email: "offers@sunnyshares.example.net" }, to: [P.alice], subject: "Your free holiday is waiting", text: "Spend 90 minutes with our advisers and win a free weekend away.", date: daysBefore(13, 5, 30), mailboxes: ["junk"], keywords: ["$junk"] },
];

const ALICE_TRASH: Simple[] = [
  { slug: "trash-webinar", from: { name: "Webinars Weekly", email: "events@webinars.example.com" }, to: [P.alice], subject: "Last chance: productivity webinar", text: "Starts in one hour. Save your seat.", date: daysBefore(6, 12, 0), mailboxes: ["trash"] },
  { slug: "trash-survey", from: { name: "Customer Care", email: "survey@shop.example.org" }, to: [P.alice], subject: "How did we do?", text: "Rate your recent order from 1 to 10.", date: daysBefore(18, 15, 30), mailboxes: ["trash"] },
  { slug: "trash-old-plan", from: P.sam, to: [P.alice], subject: "Old plan for Saturday", text: "Ignore this one, plans changed.", date: daysBefore(22, 9, 45), mailboxes: ["trash"], keywords: [] },
];

function drafts(): SeedEmail[] {
  const roadmapIds = conversationMessageIds("q4-roadmap");
  return [
    seed(
      {
        key: "alice/draft-offsite",
        from: P.alice,
        to: [P.bob],
        subject: "Thoughts on the offsite",
        date: daysBefore(1, 21, 30),
        messageId: "draft-offsite@postern.test",
        text: "Bob,\n\nSome thoughts on the offsite while they are fresh:\n\n- more time outside\n- fewer slides\n",
      },
      { account: "alice", mailboxes: ["drafts"], keywords: ["$draft", "$seen"] },
    ),
    // A reply being written in the roadmap conversation: it joins that thread.
    seed(
      {
        key: "alice/draft-roadmap-reply",
        from: P.alice,
        to: [P.carol, P.bob, P.dave],
        subject: "Re: Q4 roadmap review",
        date: daysBefore(1, 22, 5),
        messageId: "draft-roadmap-reply@postern.test",
        inReplyTo: roadmapIds[roadmapIds.length - 1],
        references: roadmapIds,
        text: "Thanks Carol. One question before Thursday:",
      },
      { account: "alice", thread: "conv:q4-roadmap", mailboxes: ["drafts"], keywords: ["$draft", "$seen"] },
    ),
  ];
}

const BOB_MAIL: Simple[] = [
  { slug: "bob-sam-climbing", from: P.sam, to: [P.bob], subject: "Climbing on Thursday?", text: "Bob, are you coming on Thursday? Alice is.", date: daysBefore(0, 8, 12), mailboxes: ["inbox"], keywords: [] },
  { slug: "bob-carol-kickoff", from: P.carol, to: [P.bob], subject: "Northwind kickoff notes", text: "Bob, my notes from the kickoff are below. Action items are yours and mine.", date: daysBefore(20, 14, 0), mailboxes: ["archive"] },
  { slug: "bob-to-dave", from: P.bob, to: [P.dave], subject: "Illustration days", text: "Dave, confirming the two days in the week of the 12th.", date: daysBefore(19, 10, 30), mailboxes: ["sent"] },
  { slug: "bob-spam", from: { name: "Prize Desk", email: "prizes@lucky.example.net" }, to: [P.bob], subject: "You have won a lifetime supply of socks!!!", text: "CONGRATULATIONS! Reply now to claim your socks.", date: daysBefore(2, 3, 15), mailboxes: ["junk"], keywords: ["$junk"] },
  { slug: "bob-trash", from: { name: "Webinars Weekly", email: "events@webinars.example.com" }, to: [P.bob], subject: "Last chance: productivity webinar", text: "Starts in one hour.", date: daysBefore(6, 12, 1), mailboxes: ["trash"] },
  { slug: "bob-draft", from: P.bob, to: [P.alice], subject: "Re: Slides for Thursday", text: "Alice, two small comments on slide 4:", date: daysBefore(1, 20, 0), mailboxes: ["drafts"], keywords: ["$draft", "$seen"] },
];

export function singles(): SeedEmail[] {
  const toBob = ALICE_SENT.find((s) => s.slug === "to-bob-slides") as Simple;
  return [
    ...attachments(),
    ...international(),
    ...ALICE_PLAIN.map((s) => simple("alice", s)),
    ...ALICE_SENT.map((s) => simple("alice", s)),
    // Bob received alice's slides mail.
    simple("bob", { ...toBob, mailboxes: ["inbox"] }),
    ...ALICE_SPAM.map((s) => simple("alice", s)),
    ...ALICE_TRASH.map((s) => simple("alice", s)),
    ...drafts(),
    ...BOB_MAIL.map((s) => simple("bob", s)),
  ];
}
