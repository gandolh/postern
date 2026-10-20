// The worker's push decisions (brief 16), pure so they can be tested without a
// worker. sw.ts calls them. Nothing here imports React, the router or the JMAP
// client: all of it ends up in sw.js, which never holds a token.
//
// What a push can be (Stalwart 0.16.25):
//   PushVerification   the code for a new subscription: hand it to the page
//   EmailPush          new Inbox mail, with id, threadId, from and subject in
//                      the (end-to-end encrypted) payload: Stalwart's
//                      `urn:ietf:params:jmap:emailpush` extension
//   StateChange        states only (a server without emailPush, or a
//                      subscription made without it): a generic "New mail"
//   anything else      a DevTools test push, say: the generic one too

import { describeNewMail, NEW_MAIL_TAG, type NoticeMessage } from "../notify/show";
import { isNotificationHash, OPEN, PUSH_VERIFICATION, type OpenMessage, type PushVerificationMessage } from "./protocol";

export type PushPayload =
  | { kind: "verification"; message: PushVerificationMessage }
  | { kind: "mail"; messages: NoticeMessage[] }
  | { kind: "delivery" }
  | { kind: "quiet" }
  | { kind: "unknown" };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function addressList(value: unknown): NoticeMessage["from"] {
  if (!Array.isArray(value)) return null;
  const list = value.filter(isRecord).flatMap((a) => (typeof a["email"] === "string" ? [{ email: a["email"], name: typeof a["name"] === "string" ? a["name"] : null }] : []));
  return list.length ? list : null;
}

/** Reads a push's JSON (already decrypted by the browser). */
export function parsePushPayload(data: unknown): PushPayload {
  if (!isRecord(data)) return { kind: "unknown" };
  switch (data["@type"]) {
    case "PushVerification": {
      const id = data["pushSubscriptionId"];
      const code = data["verificationCode"];
      if (typeof id !== "string" || typeof code !== "string") return { kind: "unknown" };
      return { kind: "verification", message: { type: PUSH_VERIFICATION, pushSubscriptionId: id, verificationCode: code } };
    }
    case "EmailPush": {
      const emails = Array.isArray(data["emails"]) ? data["emails"].filter(isRecord) : [];
      const messages = emails.flatMap((e) =>
        typeof e["threadId"] === "string" ? [{ threadId: e["threadId"], from: addressList(e["from"]), subject: typeof e["subject"] === "string" ? e["subject"] : null }] : [],
      );
      return messages.length ? { kind: "mail", messages } : { kind: "delivery" };
    }
    case "StateChange": {
      const changed = isRecord(data["changed"]) ? Object.values(data["changed"]) : [];
      return changed.some((types) => isRecord(types) && "EmailDelivery" in types) ? { kind: "delivery" } : { kind: "quiet" };
    }
    default:
      return { kind: "unknown" };
  }
}

export interface WorkerNotification {
  title: string;
  options: NotificationOptions & { data: { hash: string } };
}

/** The route a notification opens: the conversation when known, else the Inbox. */
export function hashFor(threadId: string | undefined): string {
  const hash = threadId ? `#inbox/${threadId}` : "#inbox";
  return isNotificationHash(hash) ? hash : "#inbox";
}

/** What to show for a push, before the "is anyone looking?" check. */
export function notificationsFor(payload: PushPayload, images: { icon: string; badge: string }): WorkerNotification[] {
  const base = { icon: images.icon, badge: images.badge };
  switch (payload.kind) {
    case "mail":
      return describeNewMail(payload.messages).map((n) => ({
        title: n.title,
        options: { ...base, ...(n.body !== undefined ? { body: n.body } : {}), tag: n.tag, data: { hash: hashFor(n.threadId) } },
      }));
    case "delivery":
    case "unknown":
      // No token, so no way to look up who sent it: the generic one, coalesced by tag.
      return [{ title: "New mail in Postern", options: { ...base, tag: NEW_MAIL_TAG, renotify: true, data: { hash: "#inbox" } } as WorkerNotification["options"] }];
    default:
      return [];
  }
}

/** What the worker sees of a window: `WindowClient`'s url, visibility and focus. */
export interface WindowLike {
  url: string;
  visibilityState: DocumentVisibilityState;
  focused: boolean;
}

/** Postern's own windows: same origin and inside the scope (another estate app's tab is not ours). */
export function appWindows<T extends WindowLike>(windows: readonly T[], origin: string, scope: string): T[] {
  return windows.filter((w) => {
    try {
      const url = new URL(w.url);
      return url.origin === origin && url.pathname.startsWith(scope);
    } catch {
      return false;
    }
  });
}

/** Someone is looking at Postern: the open app shows new mail itself, so the worker stays quiet. */
export function anyVisible(windows: readonly WindowLike[]): boolean {
  return windows.some((w) => w.visibilityState === "visible" || w.focused);
}

/** Which window a click goes to: a focused one, else a visible one, else any; null opens a new one. */
export function windowForClick<T extends WindowLike>(windows: readonly T[]): T | null {
  return windows.find((w) => w.focused) ?? windows.find((w) => w.visibilityState === "visible") ?? windows[0] ?? null;
}

/** The click's route from the notification's data; the Inbox for anything unexpected. */
export function clickHash(data: unknown): string {
  const hash = isRecord(data) ? data["hash"] : undefined;
  return typeof hash === "string" && isNotificationHash(hash) ? hash : "#inbox";
}

export function openMessage(hash: string): OpenMessage {
  return { type: OPEN, hash };
}
