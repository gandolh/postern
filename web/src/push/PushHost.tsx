// Web Push for the signed-in session (brief 16). The shell renders it once,
// inside the labels provider. On sign-in it extends (or makes) this device's
// subscription if the person turned Web Push on here; before a user sign-out
// it destroys it while the tokens still work; after any sign-out it
// unsubscribes the browser, which needs no token.

import type { EmailPushConfig, Id, JmapClient } from "@postern/jmap";
import { useEffect, useState } from "react";
import { useAccount, useJmap } from "../auth";
import type { LabelsStore } from "../labels/labelsStore";
import { useLabelsStore } from "../labels/useLabels";
import { setActiveWebPush } from "./active";
import { onBeforeSignOut } from "./beforeSignOut";
import { browserPush } from "./browser";
import { setSignedIn } from "./register";
import { verificationInbox } from "./verification";
import { EMAIL_PUSH_PROPERTIES, WebPush, type PushServer } from "./webPush";

export const WEB_PUSH_VAPID = "urn:ietf:params:jmap:webpush-vapid";
export const EMAIL_PUSH = "urn:ietf:params:jmap:emailpush";

/** The session's VAPID public key (base64url), or null when the server has none. */
export function vapidKeyOf(client: JmapClient): string | null {
  const capability = client.session?.capabilities?.[WEB_PUSH_VAPID] as { applicationServerKey?: unknown } | undefined;
  return typeof capability?.applicationServerKey === "string" && capability.applicationServerKey !== "" ? capability.applicationServerKey : null;
}

/** Ask Stalwart to put sender and subject in the push for new Inbox mail, when it can. */
async function emailPushConfig(client: JmapClient, labels: LabelsStore): Promise<Record<Id, EmailPushConfig> | null> {
  if (!client.session?.hasCapability(EMAIL_PUSH)) return null;
  let inbox = labels.mailboxIdForRole("inbox");
  if (!inbox) {
    await labels.sync();
    inbox = labels.mailboxIdForRole("inbox");
  }
  if (!inbox) return null;
  return { [client.accountId]: { filter: { inMailbox: inbox }, properties: [...EMAIL_PUSH_PROPERTIES] } };
}

function makeWebPush(client: JmapClient, username: string, labels: LabelsStore): WebPush | null {
  // Test doubles (the shell tests' fake client) have no session or push methods.
  if (!client.pushSubscription || !client.session) return null;
  return new WebPush({
    username,
    vapidKey: vapidKeyOf(client),
    server: client.pushSubscription as PushServer,
    browser: browserPush,
    inbox: verificationInbox,
    emailPush: () => emailPushConfig(client, labels),
  });
}

export function PushHost() {
  const client = useJmap();
  const { username } = useAccount();
  const labels = useLabelsStore();
  const [push] = useState(() => makeWebPush(client, username, labels));

  useEffect(() => {
    setSignedIn(true);
    if (!push) return () => setSignedIn(false);
    setActiveWebPush(push);
    void push.refresh();
    const offSignOut = onBeforeSignOut(() => push.forget());
    return () => {
      offSignOut();
      setSignedIn(false);
      setActiveWebPush(null);
      void push.dropBrowserSubscription();
    };
  }, [push]);

  return null;
}
