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
import { MenuButton } from "../components/ui/Menu";
import { IconButton } from "../shell/IconButton";
import type { BodyState, ConvMessage } from "./conversationStore";
import { MessageBody } from "./MessageBody";
import { cn } from "../lib/cn";
import { MessageDetails } from "./MessageDetails";
import { displayName, forgedAddressInName, nameOrAddress, recipientNames } from "./people";
import { messageCardId } from "./registry";
import { Button } from "../components/ui/Button";

export interface MessageCardActions {
  toggle: () => void;
  reply: () => void;
  replyAll: () => void;
  forward: () => void;
  toggleStar: () => void;
  markUnreadFromHere: () => void;
  trash: () => void;
  reportSpam: () => void;
  /** Open the filter editor with this sender. */
  filterLike: () => void;
  /** Block (or unblock, when `senderBlocked`) the sender. */
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

function Avatar({ name, small }: { name: string; small?: boolean }) {
  const initial = (name.trim()[0] ?? "?").toUpperCase();
  return (
    <span
      className={cn(
        "inline-grid size-10 flex-none place-items-center rounded-pill bg-accent-soft text-md font-semibold text-on-accent-soft",
        small && "size-8 justify-self-center text-sm",
      )}
      aria-hidden="true"
    >
      {initial}
    </span>
  );
}

export function MessageCard({
  message,
  expanded,
  last,
  me,
  body,
  theme,
  allowRemote,
  canReportSpam,
  senderBlocked = false,
  actions,
  onFocusCard,
}: MessageCardProps) {
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
        className="group/msg px-5 hover:bg-row-hover focus:outline-none focus-visible:[outline:var(--focus-ring)] focus-visible:-outline-offset-2 @max-[40rem]/conv:px-4 [li+li>&]:border-t [li+li>&]:border-border"
        data-expanded="false"
        data-unread={unread || undefined}
        tabIndex={-1}
        aria-labelledby={headingId}
        onFocus={onFocusCard}
      >
        <h2 className="m-0 [font-size:inherit] [line-height:inherit] [font-weight:inherit]" id={headingId}>
          <button
            type="button"
            className="group/line grid min-h-13 w-full cursor-pointer grid-cols-[2rem_minmax(0,1fr)] items-start gap-x-3 bg-transparent py-3 text-start text-text"
            aria-expanded={false}
            onClick={actions.toggle}
          >
            <Avatar name={name} small />
            <span className="flex min-w-0 items-baseline gap-2">
              <span className="flex-none font-semibold group-hover/line:underline group-data-unread/msg:font-bold">
                <bdi>{name}</bdi>
              </span>
              {from && displayName(from) ? (
                <bdi className="min-w-0 flex-1 [mask-image:linear-gradient(to_right,black_calc(100%-1rem),transparent)] text-sm leading-[1.125rem] font-normal whitespace-nowrap text-text-muted @max-[40rem]/conv:hidden">
                  {from.email}
                </bdi>
              ) : null}
              <time
                className="ml-auto flex-none text-xs leading-4 whitespace-nowrap text-text-muted tabular-nums"
                dateTime={date}
                title={formatFullDate(date)}
              >
                {cardDate(date)}
              </time>
            </span>
            <span className="col-start-2 block min-w-0 [mask-image:linear-gradient(to_right,black_calc(100%-1.5rem),transparent)] text-sm leading-[1.125rem] whitespace-nowrap text-text-muted">
              {message.preview}
            </span>
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
    ...(from && !fromMe
      ? [{ label: `${senderBlocked ? "Unblock" : "Block"} "${name}"`, onSelect: actions.block }]
      : []),
    { label: "Filter messages like these", onSelect: actions.filterLike },
    { label: "Show original", onSelect: actions.showOriginal },
  ];

  return (
    <article
      id={messageCardId(message.id)}
      className="group/msg px-5 focus:outline-none focus-visible:[outline:var(--focus-ring)] focus-visible:-outline-offset-2 @max-[40rem]/conv:px-4 [li+li>&]:border-t [li+li>&]:border-border"
      data-expanded="true"
      tabIndex={-1}
      aria-labelledby={headingId}
      onFocus={onFocusCard}
    >
      <header className="grid grid-cols-[2.5rem_minmax(0,1fr)_auto] items-start gap-3 pt-5 pb-1 @max-[40rem]/conv:grid-cols-[2.5rem_minmax(0,1fr)]">
        <Avatar name={name} />
        <div className="min-w-0">
          <SenderHoverCard address={from}>
            <h2 className="m-0 [font-size:inherit] [line-height:inherit] [font-weight:inherit]" id={headingId}>
              <button
                type="button"
                className="inline-flex max-w-full cursor-pointer flex-wrap items-baseline gap-x-2 gap-y-0 bg-transparent p-0 text-start text-text max-sm:min-h-11 max-sm:items-center"
                aria-expanded={true}
                onClick={actions.toggle}
                title="Collapse this message"
              >
                <bdi className="text-md font-bold wrap-anywhere">{name}</bdi>
                {from && displayName(from) ? (
                  <span className="text-sm leading-[1.125rem] wrap-anywhere text-text-muted">
                    &lt;<bdi>{from.email}</bdi>&gt;
                  </span>
                ) : null}
              </button>
            </h2>
          </SenderHoverCard>
          {forged ? (
            <p
              className="my-1 flex items-start gap-2 rounded-sm bg-danger-soft px-2 py-1 text-sm text-danger [&_.lucide]:mt-[0.1rem] [&_.lucide]:[--icon-size:1rem]"
              role="note"
            >
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
          <div className="flex items-center gap-1 text-sm text-text-muted">
            <Recipients to={message.to} cc={message.cc} me={me} />
            <button
              type="button"
              className="inline-grid size-6 cursor-pointer place-items-center rounded-sm bg-transparent p-0 text-text-muted hover:bg-hover max-sm:size-11 [&_.lucide]:transition-transform [&_.lucide]:duration-(--duration-fast) [&_.lucide]:ease-out [&_.lucide]:[--icon-size:1rem] aria-expanded:[&_.lucide]:rotate-180"
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
        <div className="flex items-center gap-0 @max-[40rem]/conv:col-span-full @max-[40rem]/conv:justify-end">
          <time
            className="mr-2 text-xs leading-4 whitespace-nowrap text-text-muted tabular-nums"
            dateTime={date}
            title={formatFullDate(date)}
          >
            {cardDate(date)}
          </time>
          <IconButton
            className="size-9 aria-pressed:bg-transparent aria-pressed:text-star max-sm:size-11 aria-pressed:[&_.lucide]:fill-current"
            label={starred ? "Remove star" : "Star this message"}
            icon={Star}
            aria-pressed={starred}
            onClick={actions.toggleStar}
          />
          <IconButton className="size-9 max-sm:size-11" label="Reply" icon={CornerUpLeft} onClick={actions.reply} />
          <MenuButton
            label="More"
            icon={MoreVertical}
            items={moreItems}
            align="end"
            className="[&_[data-slot=icon-button]]:size-9 max-sm:[&_[data-slot=icon-button]]:size-11"
          />
        </div>
      </header>
      {/* A calendar invite's card, from parsed text only; the body below is untouched. */}
      <InviteCard
        messageId={message.id}
        messageIdHeader={message.messageId}
        keywords={message.keywords}
        attachments={message.attachments}
      />
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
        <div className="ml-13 flex flex-wrap gap-2 pt-1.5 pb-5 @max-[40rem]/conv:ml-0 [&_.lucide]:[--icon-size:1.125rem]">
          <Button
            type="button"
            className="h-10 rounded-pill border-border-strong bg-surface font-medium max-sm:h-11"
            onClick={actions.reply}
          >
            <CornerUpLeft aria-hidden="true" /> Reply
          </Button>
          <Button
            type="button"
            className="h-10 rounded-pill border-border-strong bg-surface font-medium max-sm:h-11"
            onClick={actions.replyAll}
          >
            <ReplyAll aria-hidden="true" /> Reply all
          </Button>
          <Button
            type="button"
            className="h-10 rounded-pill border-border-strong bg-surface font-medium max-sm:h-11"
            onClick={actions.forward}
          >
            <CornerUpRight aria-hidden="true" /> Forward
          </Button>
        </div>
      ) : null}
    </article>
  );
}
