// Saying why a save or a send failed, in words a person can act on. The draft
// is always kept, so every message ends on what to do next.

import { isAbortError, JmapHttpError, JmapLimitError, JmapNetworkError, JmapSetError, SessionExpiredError, SignedOutError } from "@postern/jmap";

function list(value: unknown): string {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string").join(", ") : "";
}

function bytes(value: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "";
  if (value >= 1024 * 1024) return `${Math.round(value / (1024 * 1024))} MB`;
  if (value >= 1024) return `${Math.round(value / 1024)} KB`;
  return `${value} bytes`;
}

/** Why sending failed. */
export function explainSendError(err: unknown): string {
  if (err instanceof SessionExpiredError || err instanceof SignedOutError) return "Your session ended before the message was sent. Sign in again, then press Send.";
  if (err instanceof JmapSetError) {
    const e = err.error;
    switch (err.type) {
      case "forbiddenFrom":
      case "forbiddenMailFrom":
        return "The mail server won't send from this address. Choose another From address.";
      case "forbiddenToSend":
        return "This account isn't allowed to send mail.";
      case "noRecipients":
        return "Add at least one recipient.";
      case "invalidRecipients": {
        const who = list(e["invalidRecipients"]);
        return who ? `The mail server refused these addresses: ${who}.` : "The mail server refused one of the addresses.";
      }
      case "tooManyRecipients": {
        const max = typeof e["maxRecipients"] === "number" ? ` It takes up to ${e["maxRecipients"]}.` : "";
        return `Too many recipients for the mail server.${max}`;
      }
      case "tooLarge": {
        const max = bytes(e["maxSize"]);
        return max ? `The message is too large to send. The limit is ${max}.` : "The message is too large to send.";
      }
      case "rateLimit":
        return "You've sent a lot of messages in a short time. Wait a few minutes, then try again.";
      case "overQuota":
        return "Your mailbox is full. Delete some mail, then try again.";
      case "invalidEmail":
      case "invalidProperties":
        return e.description ? `The mail server couldn't send this message: ${e.description}` : "The mail server couldn't send this message.";
      case "notFound":
        return "The draft was changed or deleted somewhere else. Check Drafts, then send it again.";
      default:
        return e.description ? `The mail server couldn't send the message: ${e.description}` : "The mail server couldn't send the message.";
    }
  }
  if (err instanceof JmapNetworkError) return "Can't reach the mail server. Check your connection, then press Send again.";
  if (err instanceof JmapHttpError) return `The mail server had a problem (${err.status}). Press Send to try again.`;
  return "Something went wrong while sending. Press Send to try again.";
}

/** Why saving the draft failed (shown next to the Send button). */
export function explainSaveError(err: unknown): string {
  if (isAbortError(err)) return "";
  if (err instanceof SessionExpiredError || err instanceof SignedOutError) return "Not saved: sign in again.";
  if (err instanceof JmapNetworkError) return "Not saved: offline. Postern will try again.";
  if (err instanceof JmapSetError) {
    if (err.type === "overQuota") return "Not saved: your mailbox is full.";
    if (err.type === "tooLarge") return "Not saved: the draft is too large.";
    return "Couldn't save the draft.";
  }
  return "Couldn't save the draft.";
}

/** Why an attachment did not upload. */
export function explainUploadError(err: unknown): string {
  if (err instanceof JmapLimitError) return "Too large for the mail server.";
  if (err instanceof JmapHttpError && err.status === 413) return "Too large for the mail server.";
  if (err instanceof JmapNetworkError) return "Upload failed: offline.";
  return "Upload failed.";
}
