// One message of the conversation: a single line when collapsed (sender,
// snippet, date), or open (sender name AND address, recipients, the details
// dropdown, date, star, reply and a menu; the body; the attachments).

import { AlertTriangle, ChevronDown, CornerUpLeft, CornerUpRight, MoreVertical, ReplyAll, Star } from "lucide-react";
import { useId, useState } from "react";
import { FLAGGED, SEEN } from "../actions/conversation";
import { AttachmentList } from "../attachments/AttachmentList";
import { formatFullDate } from "../list/format";
import { MenuButton } from "../list/Menu";
import { IconButton } from "../shell/IconButton";
import type { BodyState, ConvMessage } from "./conversationStore";
import { MessageBody } from "./MessageBody";
import { MessageDetails } from "./MessageDetails";
import { displayName, forgedAddressInName, nameOrAddress, recipientsLine } from "./people";
import { messageCardId } from "./registry";

export interface MessageCardActions {
  toggle: () => void;
  reply: () => void;
  replyAll: () => void;
  forward: () => void;
  toggleStar: () => void;
  markUnreadFromHere: () => void;
  trash: () => void;
  reportSpam: () => void;
  showOriginal: () => void;
  displayImages: () => void;
  alwaysDisplayImages: () => void;
}

export interface MessageCardProps {
  message: ConvMessage;
  expanded: boolean;
  /** The newest message shown: it carries the Reply / Reply all / Forward buttons. */
  last: boolean;
  me: string;
  body: BodyState | undefined;
  theme: "light" | "dark";
  allowRemote: boolean;
  /** Spam and Trash have no "Report spam" for a message. */
  canReportSpam: boolean;
  actions: MessageCardActions;
  onFocusCard: () => void;
}

function cardDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  const sameYear = date.getFullYear() === now.getFullYear();
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: sameYear ? undefined : "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function Avatar({ name }: { name: string }) {
  const initial = (name.trim()[0] ?? "?").toUpperCase();
  return (
    <span className="conv-avatar" aria-hidden="true">
      {initial}
    </span>
  );
}

export function MessageCard({ message, expanded, last, me, body, theme, allowRemote, canReportSpam, actions, onFocusCard }: MessageCardProps) {
  const headingId = useId();
  const detailsId = useId();
  const [details, setDetails] = useState(false);
  const from = message.from?.[0] ?? null;
  const name = from ? nameOrAddress(from) : "(no sender)";
  const unread = message.keywords[SEEN] !== true;
  const starred = message.keywords[FLAGGED] === true;
  const date = message.sentAt ?? message.receivedAt;
  const forged = from ? forgedAddressInName(from) : null;
  const fromMe = from?.email.toLowerCase() === me.toLowerCase();

  if (!expanded) {
    return (
      <article id={messageCardId(message.id)} className="conv-msg" data-expanded="false" data-unread={unread || undefined} tabIndex={-1} aria-labelledby={headingId} onFocus={onFocusCard}>
        <h2 className="conv-msg-heading" id={headingId}>
          <button type="button" className="conv-msg-line" aria-expanded={false} onClick={actions.toggle}>
            <Avatar name={name} />
            <span className="conv-line-from">
              {name}
              {from && displayName(from) ? <span className="conv-line-address"> {from.email}</span> : null}
            </span>
            <span className="conv-line-preview">{message.preview}</span>
            <time className="conv-line-date" dateTime={date} title={formatFullDate(date)}>
              {cardDate(date)}
            </time>
          </button>
        </h2>
      </article>
    );
  }

  const moreItems = [
    { label: "Reply all", onSelect: actions.replyAll },
    { label: "Forward", onSelect: actions.forward },
    { label: "Mark unread from here", onSelect: actions.markUnreadFromHere },
    { label: "Delete this message", onSelect: actions.trash },
    ...(canReportSpam && !fromMe ? [{ label: "Report spam", onSelect: actions.reportSpam }] : []),
    { label: "Show original", onSelect: actions.showOriginal },
  ];

  return (
    <article id={messageCardId(message.id)} className="conv-msg" data-expanded="true" tabIndex={-1} aria-labelledby={headingId} onFocus={onFocusCard}>
      <header className="conv-msg-head">
        <Avatar name={name} />
        <div className="conv-msg-who">
          <h2 className="conv-msg-heading" id={headingId}>
            <button type="button" className="conv-msg-sender" aria-expanded={true} onClick={actions.toggle} title="Collapse this message">
              <span className="conv-sender-name">{name}</span>
              {from && displayName(from) ? <span className="conv-sender-address">&lt;{from.email}&gt;</span> : null}
            </button>
          </h2>
          {forged ? (
            <p className="conv-forged" role="note">
              <AlertTriangle aria-hidden="true" />
              <span>
                The name says <strong>{forged}</strong>, but this message came from <strong>{from?.email}</strong>.
              </span>
            </p>
          ) : null}
          <div className="conv-msg-to">
            <span>{recipientsLine(message.to, message.cc, me)}</span>
            <button
              type="button"
              className="conv-details-toggle"
              aria-expanded={details}
              aria-controls={details ? detailsId : undefined}
              aria-label="Show details"
              onClick={() => setDetails((d) => !d)}
            >
              <ChevronDown aria-hidden="true" />
            </button>
          </div>
          {details ? <MessageDetails message={message} id={detailsId} /> : null}
        </div>
        <div className="conv-msg-side">
          <time className="conv-msg-date" dateTime={date} title={formatFullDate(date)}>
            {cardDate(date)}
          </time>
          <IconButton
            className="conv-star"
            label={starred ? "Remove star" : "Star this message"}
            icon={Star}
            aria-pressed={starred}
            onClick={actions.toggleStar}
          />
          <IconButton label="Reply" icon={CornerUpLeft} onClick={actions.reply} />
          <MenuButton label="More" icon={MoreVertical} items={moreItems} align="end" />
        </div>
      </header>
      <MessageBody
        state={body}
        senderAddress={from?.email ?? null}
        senderName={name}
        theme={theme}
        allowRemote={allowRemote}
        onDisplayImages={actions.displayImages}
        onAlwaysDisplayImages={from && !fromMe ? actions.alwaysDisplayImages : null}
        onShowOriginal={actions.showOriginal}
      />
      {body?.status === "ready" || body?.status === "error" ? (
        <AttachmentList
          parts={message.attachments}
          inlineCids={body?.status === "ready" && body.body.kind === "html" ? body.body.inlineCids : undefined}
          label={`Attachments from ${name}`}
        />
      ) : null}
      {last ? (
        <div className="conv-reply-actions">
          <button type="button" className="btn" onClick={actions.reply}>
            <CornerUpLeft aria-hidden="true" /> Reply
          </button>
          <button type="button" className="btn" onClick={actions.replyAll}>
            <ReplyAll aria-hidden="true" /> Reply all
          </button>
          <button type="button" className="btn" onClick={actions.forward}>
            <CornerUpRight aria-hidden="true" /> Forward
          </button>
        </div>
      ) : null}
    </article>
  );
}
