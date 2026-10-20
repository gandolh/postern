// Shows a desktop notification for new mail: the sender and the subject, never
// the body. Clicking brings the window forward and opens the conversation.
//
// The wording lives in describeNewMail(), a pure function the service worker
// shares (brief 16: Web Push while Postern is closed), so a notification reads
// the same whichever side shows it.

import type { InboxMessage } from "./detector";

export interface NotifyDeps {
  /**
   * Shows a notification: the Notification constructor, or the service
   * worker's showNotification (Android has no constructor). options.data.hash
   * is the route a click opens, for the worker's notificationclick.
   */
  create: (title: string, options: NotificationOptions) => { onclick: ((ev: Event) => void) | null; close(): void };
  permission: () => NotificationPermission | "unsupported";
  /** Is the person looking at the Inbox right now? Then no notification (Gmail does the same). */
  watchingInbox: () => boolean;
  focusWindow: () => void;
  openConversation: (threadId: string) => void;
  icon?: string;
}

/** How many separate notifications before they merge into one summary. */
export const MAX_SEPARATE = 3;

/** The tag of the merged "N new messages" notification (and of the worker's generic one). */
export const NEW_MAIL_TAG = "postern-new-mail";

/** One notification to show: its title, body and tag, and the conversation a click opens. */
export interface NewMailNotice {
  title: string;
  body?: string;
  tag: string;
  /** The conversation to open on click (the newest message's, for a summary). */
  threadId?: string;
}

/** The part of a message the wording reads. Brief 11's InboxMessage and the worker's EmailPush emails both fit. */
export type NoticeMessage = Pick<InboxMessage, "threadId" | "from" | "subject">;

function senderOf(m: NoticeMessage): string {
  const from = m.from?.[0];
  return from?.name?.trim() || from?.email || "Unknown sender";
}

/** The notifications for these new messages (oldest first): one each, or one summary past MAX_SEPARATE. */
export function describeNewMail(messages: readonly NoticeMessage[]): NewMailNotice[] {
  if (messages.length === 0) return [];
  if (messages.length > MAX_SEPARATE) {
    const newest = messages[messages.length - 1]?.threadId;
    return [{ title: `${messages.length} new messages`, tag: NEW_MAIL_TAG, ...(newest ? { threadId: newest } : {}) }];
  }
  return messages.map((m) => ({ title: senderOf(m), body: m.subject?.trim() || "(no subject)", tag: m.threadId, threadId: m.threadId }));
}

/** Notifies for each message (or once for a burst). Returns how many notifications were shown. */
export function notifyNewMail(messages: readonly InboxMessage[], deps: NotifyDeps): number {
  if (messages.length === 0 || deps.permission() !== "granted" || deps.watchingInbox()) return 0;
  const notices = describeNewMail(messages);
  for (const notice of notices) {
    const hash = notice.threadId ? `#inbox/${notice.threadId}` : "#inbox";
    const n = deps.create(notice.title, { ...(notice.body !== undefined ? { body: notice.body } : {}), tag: notice.tag, icon: deps.icon, data: { hash } });
    n.onclick = () => {
      deps.focusWindow();
      if (notice.threadId) deps.openConversation(notice.threadId);
      n.close();
    };
  }
  return notices.length;
}
