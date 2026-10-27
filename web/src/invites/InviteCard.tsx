// A calendar invite's card, above the message body (brief 25): what, when (in
// this browser's time zone), where, who organises, and Yes / No / Maybe with
// the current answer marked. METHOD:CANCEL says the event was cancelled; an
// invite that doesn't name one of the user's addresses shows the facts only;
// anything else (PUBLISH, no METHOD: a plain .ics file) gets no card and stays
// an attachment.
//
// Built from parsed values shown as text: nothing from the .ics is ever HTML,
// and only an http(s) LOCATION becomes a link, opened like a link in mail (a
// new tab, no opener, no referrer).

import type { EmailBodyPart, Id, Identity, JmapClient } from "@postern/jmap";
import { CalendarDays } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { isQuietError } from "../actions/runner";
import { useJmap } from "../auth";
import { useLabelsStore } from "../labels/useLabels";
import { useToast } from "../shell/toast";
import { parseInvite, type EventTime, type Invite } from "./ics";
import { answerOf, myAttendance, sendInviteReply, type Answer } from "./reply";
import "./invites.css";

/** The parts that can carry an invite: a text/calendar alternative first, then an .ics file. */
export function calendarParts(parts: readonly EmailBodyPart[]): EmailBodyPart[] {
  const isCalendar = (p: EmailBodyPart) => /^(text\/calendar|application\/ics|text\/x-vcalendar)$/i.test(p.type ?? "") || /\.ics$/i.test(p.name ?? "");
  return parts.filter((p) => p.blobId && isCalendar(p)).sort((a, b) => Number(/^text\/calendar$/i.test(b.type ?? "")) - Number(/^text\/calendar$/i.test(a.type ?? "")));
}

/** The invite a message carries, if any: REQUEST or CANCEL only. */
export async function loadInvite(client: JmapClient, parts: readonly EmailBodyPart[], signal?: AbortSignal): Promise<Invite | null> {
  for (const part of calendarParts(parts).slice(0, 2)) {
    if ((part.size ?? 0) > 256 * 1024) continue;
    const res = await client.blob.download({ blobId: part.blobId!, name: "invite.ics", type: "text/plain" }, { signal });
    const invite = parseInvite(await res.text());
    if (invite && (invite.method === "REQUEST" || invite.method === "CANCEL") && invite.uid) return invite;
  }
  return null;
}

const identityCache = new WeakMap<JmapClient, Promise<readonly Identity[]>>();
function identitiesOf(client: JmapClient): Promise<readonly Identity[]> {
  let p = identityCache.get(client);
  if (!p) {
    p = client.identity.get().then(
      (r) => r.list,
      (err: unknown) => {
        identityCache.delete(client);
        throw err;
      },
    );
    identityCache.set(client, p);
  }
  return p;
}

function formatWhen(start: EventTime | null, end: EventTime | null): string {
  if (!start) return "Time not given";
  if (start.allDay) {
    const day = new Intl.DateTimeFormat(undefined, { weekday: "short", year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
    const last = end?.allDay ? new Date(end.at.getTime() - 86_400_000) : null;
    return last && last.getTime() > start.at.getTime() ? `${day.format(start.at)} – ${day.format(last)} (all day)` : `${day.format(start.at)} (all day)`;
  }
  const full = new Intl.DateTimeFormat(undefined, { weekday: "short", year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  const time = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit", timeZoneName: "short" });
  const sameDay = end && !end.allDay && end.at.toDateString() === start.at.toDateString();
  let out = end && !end.allDay ? (sameDay ? `${full.format(start.at)} – ${time.format(end.at)}` : `${full.format(start.at)} – ${full.format(end.at)}`) : full.format(start.at);
  if (!(end && !end.allDay && sameDay)) out += ` (${new Intl.DateTimeFormat(undefined, { timeZoneName: "short" }).formatToParts(start.at).find((p) => p.type === "timeZoneName")?.value ?? ""})`;
  if (start.floating) out += `, time zone “${start.tzid ?? ""}” unknown: shown as your local time`;
  return out;
}

/** Only an http(s) address is a link; anything else (javascript:, data:) is text. */
function placeLink(location: string): string | null {
  if (!/^https?:\/\//i.test(location)) return null;
  try {
    const url = new URL(location);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

const ANSWERS: { answer: Answer; label: string }[] = [
  { answer: "ACCEPTED", label: "Yes" },
  { answer: "DECLINED", label: "No" },
  { answer: "TENTATIVE", label: "Maybe" },
];

export interface InviteCardProps {
  messageId: Id;
  messageIdHeader: string[] | null;
  keywords: Readonly<Record<string, true>>;
  attachments: readonly EmailBodyPart[];
}

export function InviteCard({ messageId, messageIdHeader, keywords, attachments }: InviteCardProps) {
  const client = useJmap();
  const labels = useLabelsStore();
  const toast = useToast();
  const headingId = useId();
  const [state, setState] = useState<{ invite: Invite; identities: readonly Identity[] } | null>(null);
  const [answer, setAnswer] = useState<Answer | null>(() => answerOf(keywords));
  const [busy, setBusy] = useState(false);
  const partsKey = calendarParts(attachments)
    .map((p) => p.blobId)
    .join(",");

  useEffect(() => {
    if (!partsKey) return;
    const ac = new AbortController();
    void Promise.all([loadInvite(client, attachments, ac.signal), identitiesOf(client)]).then(
      ([invite, identities]) => {
        if (!ac.signal.aborted && invite) setState({ invite, identities });
      },
      () => {
        // Not readable: the attachment is still there to download.
      },
    );
    return () => ac.abort();
    // The parts' blobs are what matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, partsKey]);

  if (!state) return null;
  const { invite, identities } = state;
  const cancelled = invite.method === "CANCEL";
  const mine = cancelled ? null : myAttendance(invite, identities);
  const current = answer ?? (mine && ["ACCEPTED", "DECLINED", "TENTATIVE"].includes(mine.me.partstat) ? (mine.me.partstat as Answer) : null);
  const link = placeLink(invite.location);

  const reply = async (choice: Answer) => {
    if (!mine || busy) return;
    setBusy(true);
    try {
      await sendInviteReply(client, {
        invite,
        messageId,
        messageIdHeader,
        identity: mine.identity,
        me: mine.me,
        answer: choice,
        draftsMailboxId: labels.mailboxIdForRole("drafts"),
        sentMailboxId: labels.mailboxIdForRole("sent"),
      });
      setAnswer(choice);
      toast.show({ message: `Reply sent: ${ANSWERS.find((a) => a.answer === choice)!.label}.` });
      void labels.sync();
    } catch (err) {
      if (!isQuietError(err)) toast.show({ message: "Couldn't send your reply. Try again in a moment." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="invite-card" aria-labelledby={headingId} data-method={invite.method.toLowerCase()}>
      <CalendarDays className="invite-icon" aria-hidden="true" />
      <div className="invite-main">
        <h3 id={headingId} className="invite-title">
          {invite.summary || "(no title)"}
        </h3>
        {cancelled ? (
          <p className="invite-cancelled" role="note">
            This event was cancelled
          </p>
        ) : null}
        <dl className="invite-facts">
          <div>
            <dt>When</dt>
            <dd>{formatWhen(invite.start, invite.end)}</dd>
          </div>
          {invite.location ? (
            <div>
              <dt>Where</dt>
              <dd>
                {link ? (
                  <a href={link} target="_blank" rel="noopener noreferrer">
                    {invite.location}
                  </a>
                ) : (
                  invite.location
                )}
              </dd>
            </div>
          ) : null}
          {invite.organizer ? (
            <div>
              <dt>Organizer</dt>
              <dd>
                {invite.organizer.name ? (
                  <>
                    <bdi>{invite.organizer.name}</bdi> &lt;<bdi>{invite.organizer.email}</bdi>&gt;
                  </>
                ) : (
                  <bdi>{invite.organizer.email}</bdi>
                )}
              </dd>
            </div>
          ) : null}
        </dl>
        {mine ? (
          <div className="invite-answer" role="group" aria-label="Going?">
            <span className="invite-answer-label" aria-hidden="true">
              Going?
            </span>
            {ANSWERS.map(({ answer: a, label }) => (
              <button key={a} type="button" className="btn invite-answer-btn" aria-pressed={current === a} disabled={busy} onClick={() => void reply(a)}>
                {label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
