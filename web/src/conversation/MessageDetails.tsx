// The details under a sender: from, reply-to, to, cc, date, subject,
// mailed-by and signed-by (from Stalwart's Authentication-Results), as
// Gmail's "show details" does.

import type { EmailAddress } from "@postern/jmap";
import { formatFullDate } from "../list/format";
import type { ConvMessage } from "./conversationStore";
import { fullAddress, readAuthenticationResults } from "./people";

function Addresses({ list }: { list: readonly EmailAddress[] | null | undefined }) {
  if (!list?.length) return null;
  return (
    <>
      {list.map((a, i) => (
        <span key={`${a.email}-${i}`} className="conv-details-address">
          <bdi>{fullAddress(a)}</bdi>
          {i < list.length - 1 ? ", " : ""}
        </span>
      ))}
    </>
  );
}

export function MessageDetails({ message, id }: { message: ConvMessage; id: string }) {
  const auth = readAuthenticationResults(message.authResults);
  const replyTo =
    message.replyTo?.filter((r) => !message.from?.some((f) => f.email.toLowerCase() === r.email.toLowerCase())) ?? [];
  return (
    <dl
      id={id}
      className="m-0 mt-2 grid max-w-160 grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 rounded-md border border-border bg-surface-raised px-4 py-3 text-sm shadow-sm [&>dd]:m-0 [&>dd]:wrap-anywhere [&>dt]:text-end [&>dt]:text-text-muted"
    >
      <dt>from:</dt>
      <dd>
        <Addresses list={message.from} />
      </dd>
      {replyTo.length > 0 ? (
        <>
          <dt>reply-to:</dt>
          <dd>
            <Addresses list={replyTo} />
          </dd>
        </>
      ) : null}
      {message.to?.length ? (
        <>
          <dt>to:</dt>
          <dd>
            <Addresses list={message.to} />
          </dd>
        </>
      ) : null}
      {message.cc?.length ? (
        <>
          <dt>cc:</dt>
          <dd>
            <Addresses list={message.cc} />
          </dd>
        </>
      ) : null}
      {message.bcc?.length ? (
        <>
          <dt>bcc:</dt>
          <dd>
            <Addresses list={message.bcc} />
          </dd>
        </>
      ) : null}
      <dt>date:</dt>
      <dd>{formatFullDate(message.sentAt ?? message.receivedAt)}</dd>
      <dt>subject:</dt>
      <dd>{message.subject || "(no subject)"}</dd>
      <dt>mailed-by:</dt>
      <dd>{auth?.mailedBy ?? <span className="text-text-subtle">not verified</span>}</dd>
      <dt>signed-by:</dt>
      <dd>{auth?.signedBy ?? <span className="text-text-subtle">not signed</span>}</dd>
    </dl>
  );
}
