// Shows a desktop notification for new mail: the sender and the subject, never
// the body. Clicking brings the window forward and opens the conversation.

import type { InboxMessage } from "./detector";

export interface NotifyDeps {
  /** Constructs a notification (the Notification constructor in the browser). */
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

function senderOf(m: InboxMessage): string {
  const from = m.from?.[0];
  return from?.name?.trim() || from?.email || "Unknown sender";
}

/** Notifies for each message (or once for a burst). Returns how many notifications were shown. */
export function notifyNewMail(messages: readonly InboxMessage[], deps: NotifyDeps): number {
  if (messages.length === 0 || deps.permission() !== "granted" || deps.watchingInbox()) return 0;
  const open = (threadId?: string) => {
    deps.focusWindow();
    if (threadId) deps.openConversation(threadId);
  };
  if (messages.length > MAX_SEPARATE) {
    const n = deps.create(`${messages.length} new messages`, { tag: "postern-new-mail", icon: deps.icon });
    n.onclick = () => {
      open(messages[messages.length - 1]?.threadId);
      n.close();
    };
    return 1;
  }
  for (const m of messages) {
    const n = deps.create(senderOf(m), { body: m.subject?.trim() || "(no subject)", tag: m.threadId, icon: deps.icon });
    n.onclick = () => {
      open(m.threadId);
      n.close();
    };
  }
  return messages.length;
}
