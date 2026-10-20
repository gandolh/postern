// Live updates (brief 11): the push stream, the connection status in the top
// bar, the tab title and favicon badge, and desktop notifications for new
// Inbox mail. The shell renders it once, under the labels provider.

import type { PushStatus, StateChange } from "@postern/jmap";
import { useEffect, useRef, useState } from "react";
import { publishMailChange } from "../actions";
import { useAccount, useJmap } from "../auth";
import { useLabels, useLabelsStore } from "../labels/useLabels";
import { applyListStateChange } from "../list";
import { getDesktopNotifications, NewMailDetector, notifyNewMail, setNotifyAccount, subscribeDesktopNotifications, type InboxMessage } from "../notify";
import { getRoute, navigate } from "../shell/router";
import { TopBarStatus } from "../shell/status";
import { statusMessage } from "./status";
import { createTabIndicators } from "./title";

const POLL_MS = 30_000;
const NOTIFY_PROPERTIES = ["id", "threadId", "receivedAt", "from", "subject", "keywords"] as const;

export function LiveHost() {
  const client = useJmap();
  const account = useAccount();
  const labelsStore = useLabelsStore();
  const labels = useLabels();
  const [status, setStatus] = useState<PushStatus>("connecting");
  const unread = labels.system.inbox.label?.unreadThreads ?? 0;

  // The setting is read for this account.
  useEffect(() => {
    setNotifyAccount(account.username);
  }, [account.username]);

  // The stream.
  useEffect(() => {
    // Test doubles (the shell tests' fake client) have no stream to read.
    if (typeof client.push !== "function") return;
    const detector = new NewMailDetector();
    let enabled = getDesktopNotifications();
    let looking: Promise<void> = Promise.resolve();
    const unsubscribeSetting = subscribeDesktopNotifications(() => {
      const next = getDesktopNotifications();
      if (next && !enabled) {
        detector.reset();
        void look(false);
      }
      enabled = next;
    });

    const look = (notify: boolean): Promise<void> => {
      looking = looking.then(async () => {
        try {
          // The first look can come before the labels have loaded.
          let inbox = labelsStore.mailboxIdForRole("inbox");
          if (!inbox) {
            await labelsStore.sync();
            inbox = labelsStore.mailboxIdForRole("inbox");
          }
          if (!inbox) return;
          const { list } = await client.email.queryAndGet(
            { filter: { inMailbox: inbox }, sort: [{ property: "receivedAt", isAscending: false }], limit: 10 },
            { properties: [...NOTIFY_PROPERTIES] },
          );
          const fresh = detector.observe(list as unknown as InboxMessage[]);
          if (notify) {
            notifyNewMail(fresh, {
              create: (title, options) => new Notification(title, options),
              permission: () => (typeof Notification === "undefined" ? "unsupported" : Notification.permission),
              watchingInbox: () => {
                const route = getRoute();
                return document.visibilityState === "visible" && document.hasFocus() && route.kind === "system" && route.view === "inbox";
              },
              focusWindow: () => window.focus(),
              openConversation: (threadId) => navigate({ kind: "system", view: "inbox", conversationId: threadId }),
              icon: "/favicon.svg",
            });
          }
        } catch {
          // Notifications are best effort; the list and labels report real errors.
        }
      });
      return looking;
    };

    const reader = client.push({ types: ["Email", "Mailbox", "Thread", "EmailDelivery"], pollIntervalMs: POLL_MS, streamRetryMs: 60_000 });
    const accountId = () => client.accountId;
    const onChange = (change: StateChange) => {
      const types = change.changed[accountId()] ?? {};
      void labelsStore.applyStateChange(change);
      void applyListStateChange(change);
      // The open conversation and search results refresh on the actions bus.
      if (types["Email"] !== undefined || types["Thread"] !== undefined) publishMailChange({ kind: "settled" });
      if (enabled && types["Email"] !== undefined) void look(true);
    };
    const offChange = reader.onStateChange(onChange);
    const offStatus = reader.onStatus(setStatus);
    reader.start();
    if (enabled) void look(false);
    return () => {
      unsubscribeSetting();
      offChange();
      offStatus();
      void reader.stop();
    };
  }, [client, labelsStore]);

  // Tab title and favicon badge.
  const indicators = useRef<ReturnType<typeof createTabIndicators> | null>(null);
  useEffect(() => {
    const created = createTabIndicators();
    indicators.current = created;
    return () => {
      created.restore();
      indicators.current = null;
    };
  }, []);
  useEffect(() => {
    indicators.current?.set(unread);
  }, [unread]);

  const message = statusMessage(status, POLL_MS);
  if (!message) return null;
  return (
    <TopBarStatus>
      <span className="shell-status" role="status">
        {message}
      </span>
    </TopBarStatus>
  );
}
