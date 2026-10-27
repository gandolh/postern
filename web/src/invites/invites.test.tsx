// @vitest-environment jsdom
// Calendar invites (brief 25): the parser (times, zones, escapes, hostile
// values), the REPLY it writes, and the card over the compose test server:
// Yes sends the REPLY to the organiser and keeps the answer; CANCEL, PUBLISH,
// someone else's invite and a hostile one.

import type { EmailBodyPart } from "@postern/jmap";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { SessionContext } from "../auth/context";
import { LabelsStore } from "../labels/labelsStore";
import { LabelsStoreProvider } from "../labels/useLabels";
import { ComposeTestServer, MAILBOXES } from "../send/testServer";
import { ToastProvider } from "../shell/toast";
import { buildReply, parseInvite, zonedToUtc } from "./ics";
import { InviteCard } from "./InviteCard";

afterEach(cleanup);

function ics(method: string | null, event: string[], extra: string[] = []): string {
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//test//EN", ...(method ? [`METHOD:${method}`] : []), ...extra, "BEGIN:VEVENT", ...event, "END:VEVENT", "END:VCALENDAR", ""].join("\r\n");
}

const LISBON = ics("REQUEST", [
  "UID:planning-1@postern.test",
  "SEQUENCE:2",
  "DTSTAMP:20261027T200000Z",
  "DTSTART;TZID=Europe/Lisbon:20261105T100000",
  "DTEND;TZID=Europe/Lisbon:20261105T113000",
  "SUMMARY:Planning\\, round two",
  "LOCATION:Room 2\\; floor 3",
  'ORGANIZER;CN="Baker, Bob":mailto:bob@postern.test',
  "ATTENDEE;CN=Alice Archer;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:ALICE@postern.test",
  "ATTENDEE;CN=Carol;PARTSTAT=ACCEPTED:mailto:carol@example.org",
]);

describe("parseInvite", () => {
  it("reads the facts, unescaping text and quoted names", () => {
    const invite = parseInvite(LISBON)!;
    expect(invite).toMatchObject({ method: "REQUEST", uid: "planning-1@postern.test", sequence: 2, summary: "Planning, round two", location: "Room 2; floor 3" });
    expect(invite.organizer).toEqual({ email: "bob@postern.test", name: "Baker, Bob" });
    expect(invite.attendees).toEqual([
      { email: "ALICE@postern.test", name: "Alice Archer", partstat: "NEEDS-ACTION" },
      { email: "carol@example.org", name: "Carol", partstat: "ACCEPTED" },
    ]);
  });

  it("works out a TZID with Intl: 10:00 in Lisbon in November is 10:00 UTC, in July 09:00 UTC", () => {
    expect(parseInvite(LISBON)!.start).toEqual({ at: new Date("2026-11-05T10:00:00Z"), allDay: false, tzid: "Europe/Lisbon", floating: false });
    expect(new Date(zonedToUtc(Date.UTC(2026, 6, 1, 10, 0), "Europe/Lisbon")).toISOString()).toBe("2026-07-01T09:00:00.000Z");
    expect(new Date(zonedToUtc(Date.UTC(2026, 6, 1, 10, 0), "America/New_York")).toISOString()).toBe("2026-07-01T14:00:00.000Z");
  });

  it("reads UTC, all-day dates, a VTIMEZONE that Intl doesn't know, and an unknown zone as local time", () => {
    expect(parseInvite(ics("REQUEST", ["UID:a", "DTSTART:20261105T100000Z"]))!.start?.at.toISOString()).toBe("2026-11-05T10:00:00.000Z");
    expect(parseInvite(ics("REQUEST", ["UID:a", "DTSTART;VALUE=DATE:20261105", "DTEND;VALUE=DATE:20261106"]))!.start).toMatchObject({ allDay: true, at: new Date("2026-11-05T00:00:00Z") });
    const windows = [
      "BEGIN:VTIMEZONE",
      "TZID:W. Europe Standard Time",
      "BEGIN:STANDARD",
      "DTSTART:16011028T030000",
      "TZOFFSETTO:+0100",
      "END:STANDARD",
      "BEGIN:DAYLIGHT",
      "DTSTART:16010325T020000",
      "TZOFFSETTO:+0200",
      "END:DAYLIGHT",
      "END:VTIMEZONE",
    ];
    const summer = parseInvite(ics("REQUEST", ["UID:a", "DTSTART;TZID=W. Europe Standard Time:20260701T100000"], windows))!;
    expect(summer.start?.at.toISOString()).toBe("2026-07-01T08:00:00.000Z");
    const winter = parseInvite(ics("REQUEST", ["UID:a", "DTSTART;TZID=W. Europe Standard Time:20261201T100000"], windows))!;
    expect(winter.start?.at.toISOString()).toBe("2026-12-01T09:00:00.000Z");
    const unknown = parseInvite(ics("REQUEST", ["UID:a", "DTSTART;TZID=Somewhere Else:20261201T100000"]))!;
    expect(unknown.start).toMatchObject({ floating: true, tzid: "Somewhere Else" });
    expect(unknown.start?.at.getTime()).toBe(new Date(2026, 11, 1, 10, 0).getTime());
  });

  it("unfolds long lines, takes the master event over a changed instance, and refuses nonsense", () => {
    const folded = ics("CANCEL", ["UID:x", "SUMMARY:A very long", "  title"]);
    expect(parseInvite(folded)!.summary).toBe("A very long title");
    const recurring = ["BEGIN:VCALENDAR", "METHOD:REQUEST", "BEGIN:VEVENT", "UID:r", "RECURRENCE-ID:20261105T100000Z", "SUMMARY:Moved one", "END:VEVENT", "BEGIN:VEVENT", "UID:r", "SUMMARY:Weekly", "END:VEVENT", "END:VCALENDAR"].join("\r\n");
    expect(parseInvite(recurring)!.summary).toBe("Weekly");
    expect(parseInvite("not a calendar")).toBeNull();
    expect(parseInvite(ics("REQUEST", ["UID:x", "DTSTART:garbage", "SEQUENCE:-4"]))).toMatchObject({ start: null, sequence: 0 });
  });

  it("writes a REPLY with the same UID and SEQUENCE and the attendee's answer", () => {
    const reply = buildReply(parseInvite(LISBON)!, { email: "ALICE@postern.test", name: "Alice Archer" }, "ACCEPTED", new Date("2026-10-27T21:00:00Z"));
    const lines = reply.split("\r\n");
    expect(lines).toContain("METHOD:REPLY");
    expect(lines).toContain("UID:planning-1@postern.test");
    expect(lines).toContain("SEQUENCE:2");
    expect(lines).toContain("DTSTAMP:20261027T210000Z");
    expect(lines).toContain('ORGANIZER;CN="Baker, Bob":mailto:bob@postern.test');
    expect(lines).toContain("ATTENDEE;PARTSTAT=ACCEPTED;CN=Alice Archer:mailto:ALICE@postern.test");
    expect(lines).toContain("SUMMARY:Planning\\, round two");
  });
});

describe("the card", () => {
  async function renderCard(text: string, options: { keywords?: Record<string, true>; type?: string } = {}) {
    const server = new ComposeTestServer();
    const client = await server.connect();
    server.add({ id: "INV", mailboxIds: { [MAILBOXES.inbox]: true }, keywords: options.keywords ?? {} });
    const blobId = server.upload(new TextEncoder().encode(text), "text/calendar");
    const part = { partId: "2", blobId, size: text.length, name: null, type: options.type ?? "text/calendar", charset: "utf-8", disposition: null, cid: null, language: null, location: null } as unknown as EmailBodyPart;
    const labels = new LabelsStore(client, () => "A");
    await labels.sync();
    render(
      <SessionContext.Provider value={{ client, account: { username: "alice@postern.test" }, signOut: async () => {} }}>
        <LabelsStoreProvider store={labels}>
          <ToastProvider>
            <InviteCard messageId="INV" messageIdHeader={["invite-1@postern.test"]} keywords={options.keywords ?? {}} attachments={[part]} />
          </ToastProvider>
        </LabelsStoreProvider>
      </SessionContext.Provider>,
    );
    return { server, user: userEvent.setup() };
  }

  it("shows the facts in local time; Yes sends a REPLY to the organiser and marks the answer; No changes it", async () => {
    const { server, user } = await renderCard(LISBON);
    const card = await screen.findByRole("region", { name: "Planning, round two" });
    const when = new Intl.DateTimeFormat(undefined, { weekday: "short", year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date("2026-11-05T10:00:00Z"));
    expect(card.textContent).toContain(when);
    expect(card.textContent).toContain("Room 2; floor 3");
    expect(card.textContent).toContain("Baker, Bob <bob@postern.test>");
    const going = within(card).getByRole("group", { name: "Going?" });
    expect(within(going).getAllByRole("button").map((b) => [b.textContent, b.getAttribute("aria-pressed")])).toEqual([
      ["Yes", "false"],
      ["No", "false"],
      ["Maybe", "false"],
    ]);

    await user.click(within(going).getByRole("button", { name: "Yes" }));
    expect(await screen.findByText("Reply sent: Yes.")).toBeTruthy();
    expect(within(going).getByRole("button", { name: "Yes" }).getAttribute("aria-pressed")).toBe("true");
    expect(server.submissions).toHaveLength(1);
    const sent = [...server.emails.values()].find((e) => e["subject"] === "Accepted: Planning, round two")!;
    expect(sent["to"]).toEqual([{ name: "Baker, Bob", email: "bob@postern.test" }]);
    expect(sent["from"]).toEqual([{ name: "Alice Archer", email: "alice@postern.test" }]);
    expect(sent.mailboxIds).toEqual({ [MAILBOXES.sent]: true });
    const body = (sent["bodyValues"] as Record<string, { value: string }>)["ics"]!.value;
    expect(body).toContain("METHOD:REPLY");
    expect(body).toContain("UID:planning-1@postern.test");
    expect(body).toContain("PARTSTAT=ACCEPTED");
    expect(server.emails.get("INV")!.keywords).toEqual({ "$rsvp-accepted": true });

    await user.click(within(going).getByRole("button", { name: "No" }));
    await waitFor(() => expect(server.emails.get("INV")!.keywords).toEqual({ "$rsvp-declined": true }));
    expect(within(going).getByRole("button", { name: "No" }).getAttribute("aria-pressed")).toBe("true");
    expect(server.submissions).toHaveLength(2);
  });

  it("marks the answer kept on the message", async () => {
    await renderCard(LISBON, { keywords: { "$rsvp-tentative": true } });
    const card = await screen.findByRole("region", { name: "Planning, round two" });
    expect(within(card).getByRole("button", { name: "Maybe" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("says a cancelled event was cancelled, with no answers", async () => {
    await renderCard(LISBON.replace("METHOD:REQUEST", "METHOD:CANCEL"));
    const card = await screen.findByRole("region", { name: "Planning, round two" });
    expect(within(card).getByRole("note").textContent).toBe("This event was cancelled");
    expect(within(card).queryByRole("group", { name: "Going?" })).toBeNull();
  });

  it("shows the facts only when the invite doesn't name the user", async () => {
    await renderCard(LISBON.replace("mailto:ALICE@postern.test", "mailto:dave@example.org"));
    const card = await screen.findByRole("region", { name: "Planning, round two" });
    expect(within(card).queryByRole("group", { name: "Going?" })).toBeNull();
  });

  it("gives a plain calendar file (PUBLISH, or no METHOD) no card", async () => {
    await renderCard(LISBON.replace("METHOD:REQUEST", "METHOD:PUBLISH"), { type: "application/ics" });
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByRole("region")).toBeNull();
    cleanup();
    await renderCard(LISBON.replace("METHOD:REQUEST\r\n", ""));
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByRole("region")).toBeNull();
  });

  it("shows a hostile invite as inert text: no markup, and a javascript: place is not a link", async () => {
    const hostile = ics("REQUEST", [
      "UID:h@evil.test",
      'SUMMARY:<script>window["__POSTERN_"+"PWNED"]=1</script><img src=x onerror=alert(1)>',
      'LOCATION:javascript:window["__POSTERN_"+"PWNED"]=1',
      "ORGANIZER;CN=<b>Evil</b>:mailto:boss@evil.test",
      "ATTENDEE;PARTSTAT=NEEDS-ACTION:mailto:alice@postern.test",
    ]);
    await renderCard(hostile);
    const card = await screen.findByRole("region", { name: /^<script>/ });
    expect(card.querySelector("script, img, b")).toBeNull();
    expect(card.querySelector("a")).toBeNull();
    expect(card.textContent).toContain('javascript:window["__POSTERN_"+"PWNED"]=1');
    expect((window as unknown as Record<string, unknown>)["__POSTERN_PWNED"]).toBeUndefined();
  });

  it("links an http(s) place, opening a new tab with no opener", async () => {
    await renderCard(LISBON.replace("LOCATION:Room 2\\; floor 3", "LOCATION:https://meet.example.org/abc"));
    const link = await screen.findByRole("link", { name: "https://meet.example.org/abc" });
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  });
});
