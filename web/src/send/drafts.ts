// Drafts on the server. A JMAP Email is immutable (Stalwart answers
// invalidProperties to an update of its subject or body), so every save
// creates a new draft and destroys the previous one in the same Email/set.
// The composer keeps one Message-ID for the draft's life, so each copy stays
// in the same conversation.

import { JmapSetError, type Email, type EmailCreate, type Id, type JmapClient } from "@postern/jmap";

export interface SavedDraft {
  id: Id;
  threadId: Id;
  /** Older copies the server did not destroy (other than already gone): try again next save. */
  leftOver: Id[];
}

/** Create `email` and destroy the older copies, in one request. @throws JmapSetError when the create is refused. */
export async function saveDraft(client: JmapClient, email: EmailCreate, previous: readonly Id[], signal?: AbortSignal): Promise<SavedDraft> {
  const res = await client.call("Email/set", { create: { draft: email }, ...(previous.length ? { destroy: [...previous] } : {}) }, { signal });
  const refused = res.notCreated?.["draft"];
  if (refused) throw new JmapSetError("Email/set", "draft", refused);
  const created = res.created?.["draft"];
  if (!created?.id) throw new JmapSetError("Email/set", "draft", { type: "serverFail", description: "No draft came back" });
  const leftOver = Object.entries(res.notDestroyed ?? {})
    .filter(([, e]) => e.type !== "notFound")
    .map(([id]) => id);
  return { id: created.id, threadId: created.threadId ?? "", leftOver };
}

/** Destroy drafts (Discard). Ids already gone are fine. @throws JmapSetError for any other refusal. */
export async function destroyDrafts(client: JmapClient, ids: readonly Id[], signal?: AbortSignal): Promise<void> {
  if (ids.length === 0) return;
  const res = await client.call("Email/set", { destroy: [...ids] }, { signal });
  for (const [id, error] of Object.entries(res.notDestroyed ?? {})) {
    if (error.type !== "notFound") throw new JmapSetError("Email/set", id, error);
  }
}

/** What the composer reads from a draft or from the message it answers. */
export const COMPOSE_SOURCE_PROPERTIES = [
  "id",
  "threadId",
  "mailboxIds",
  "keywords",
  "from",
  "to",
  "cc",
  "bcc",
  "replyTo",
  "subject",
  "sentAt",
  "receivedAt",
  "messageId",
  "inReplyTo",
  "references",
  "bodyStructure",
  "textBody",
  "htmlBody",
  "attachments",
  "bodyValues",
] as const;

const BODY_PART_PROPERTIES = ["partId", "blobId", "type", "name", "disposition", "cid", "size", "charset"] as const;

/** Bodies past this are cut (the quote of a huge newsletter is not worth more). */
export const MAX_SOURCE_BODY_BYTES = 1_000_000;

/** One message with its text and HTML bodies, for quoting, forwarding or reopening a draft. Null when it is gone. */
export async function loadComposeSource(client: JmapClient, id: Id, signal?: AbortSignal): Promise<Email | null> {
  const res = await client.call(
    "Email/get",
    {
      ids: [id],
      properties: [...COMPOSE_SOURCE_PROPERTIES],
      bodyProperties: [...BODY_PART_PROPERTIES, "subParts"],
      fetchTextBodyValues: true,
      fetchHTMLBodyValues: true,
      maxBodyValueBytes: MAX_SOURCE_BODY_BYTES,
    },
    { signal },
  );
  return res.list[0] ?? null;
}

/** The decoded text of a message's first text/plain body part, if it has one. */
export function plainBody(email: Pick<Email, "textBody" | "bodyValues">): string | null {
  const part = email.textBody?.find((p) => p.type.toLowerCase() === "text/plain" && p.partId);
  return part?.partId ? (email.bodyValues?.[part.partId]?.value ?? null) : null;
}

/** The decoded HTML of a message's first text/html body part, if it has one. */
export function htmlBody(email: Pick<Email, "htmlBody" | "bodyValues">): string | null {
  const part = email.htmlBody?.find((p) => p.type.toLowerCase() === "text/html" && p.partId);
  return part?.partId ? (email.bodyValues?.[part.partId]?.value ?? null) : null;
}
