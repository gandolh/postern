// One message of the conversation: a single line when collapsed (sender,
// snippet, date), or open (sender name AND address, recipients, the details
// dropdown, date, star, reply and a menu; the body; the attachments).

import { AlertTriangle, ChevronDown, CornerUpLeft, CornerUpRight, MoreVertical, ReplyAll, Star } from "lucide-react";
import { useId, useState } from "react";
import { FLAGGED, SEEN } from "../actions/conversation";
import { AttachmentList } from "../attachments/AttachmentList";
import { SenderHoverCard } from "../contacts/SenderHoverCard";
import { InviteCard } from "../invites/InviteCard";
import { formatFullDate } from "../list/format";
import { MenuButton } from "../list/Menu";
import { IconButton } from "../shell/IconButton";
import type { BodyState, ConvMessage } from "./conversationStore";
import { MessageBody } from "./MessageBody";
import { MessageDetails } from "./MessageDetails";
import { displayName, forgedAddressInName, nameOrAddress, recipientNames } from "./people";
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
  /** Brief 13: open the filter editor with this sender. */
  filterLike: () => void;
  /** Brief 13: block (or unblock, when `senderBlocked`) the sender. */
  block: () => void;
  showOriginal: () => void;
  displayImages: () => void;
  alwaysDisplayImages: () => void;
  loadInlineImages: () => void;
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
  /** The sender is on the blocked list (the menu offers Unblock). */
  senderBlocked?: boolean;
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

/** "to me, Bob, Carol", each name isolated so a name's bidi characters cannot reorder the others. */
function Recipients({ to, cc, me }: { to: ConvMessage["to"]; cc: ConvMessage["cc"]; me: string }) {
  const names = recipientNames(to, cc, me);
  if (names.length === 0) return <span>to undisclosed recipients</span>;
  return (
    <span>
      to{" "}
      {names.map((n, i) => (
        <span key={i}>
          <bdi>{n}</bdi>
          {i < names.length - 1 ? ", " : ""}
        </span>
      ))}
    </span>
  );
}

function Avatar({ name }: { name: string }) {
  const initial = (name.trim()[0] ?? "?").toUpperCase();
  return (
    <span className="conv-avatar" aria-hidden="true">
      {initial}
    </span>
  );
}

export function MessageCard({ message, expanded, last, me, body, theme, allowRemote, canReportSpam, senderBlocked = false, actions, onFocusCard }: MessageCardProps) {
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
      <article
        id={messageCardId(message.id)}
        className="conv-msg"
        data-expanded="false"
        data-unread={unread || undefined}
        tabIndex={-1}
        aria-labelledby={headingId}
        onFocus={onFocusCard}
      >
        <h2 className="conv-msg-heading" id={headingId}>
          <button type="button" className="conv-msg-line" aria-expanded={false} onClick={actions.toggle}>
            <Avatar name={name} />
            <span className="conv-line-from">
              <bdi>{name}</bdi>
              {from && displayName(from) ? (
                <>
                  {" "}
                  <bdi className="conv-line-address">{from.email}</bdi>
                </>
              ) : null}
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
    ...(from && !fromMe ? [{ label: `${senderBlocked ? "Unblock" : "Block"} "${name}"`, onSelect: actions.block }] : []),
    { label: "Filter messages like these", onSelect: actions.filterLike },
    { label: "Show original", onSelect: actions.showOriginal },
  ];

  return (
    <article id={messageCardId(message.id)} className="conv-msg" data-expanded="true" tabIndex={-1} aria-labelledby={headingId} onFocus={onFocusCard}>
      <header className="conv-msg-head">
        <Avatar name={name} />
        <div className="conv-msg-who">
          <SenderHoverCard address={from}>
            <h2 className="conv-msg-heading" id={headingId}>
              <button type="button" className="conv-msg-sender" aria-expanded={true} onClick={actions.toggle} title="Collapse this message">
                <bdi className="conv-sender-name">{name}</bdi>
                {from && displayName(from) ? (
                  <span className="conv-sender-address">
                    &lt;<bdi>{from.email}</bdi>&gt;
                  </span>
                ) : null}
              </button>
            </h2>
          </SenderHoverCard>
          {forged ? (
            <p className="conv-forged" role="note">
              <AlertTriangle aria-hidden="true" />
              <span>
                The name says{" "}
                <strong>
                  <bdi>{forged}</bdi>
                </strong>
                , but this message came from{" "}
                <strong>
                  <bdi>{from?.email}</bdi>
                </strong>
                .
              </span>
            </p>
          ) : null}
          <div className="conv-msg-to">
            <Recipients to={message.to} cc={message.cc} me={me} />
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
      {/* Brief 25: a calendar invite's card, from parsed text only; the body below is untouched. */}
      <InviteCard messageId={message.id} messageIdHeader={message.messageId} keywords={message.keywords} attachments={message.attachments} />
      <MessageBody
        state={body}
        senderAddress={from?.email ?? null}
        senderName={name}
        theme={theme}
        allowRemote={allowRemote}
        onDisplayImages={actions.displayImages}
        onAlwaysDisplayImages={from && !fromMe ? actions.alwaysDisplayImages : null}
        onShowOriginal={actions.showOriginal}
        onLoadInlineImages={actions.loadInlineImages}
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
