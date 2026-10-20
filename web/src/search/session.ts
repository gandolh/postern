// What search keeps for the signed-in session, in memory only (never storage):
// the recent searches and the recent senders. Keyed by the JmapClient, which
// is new for each sign-in, so signing out forgets both.

import type { JmapClient } from "@postern/jmap";
import { RecentSearches, type Sender } from "./suggestions";

/** How many of the newest messages the senders come from. */
export const SENDER_SAMPLE = 200;

export interface SearchSession {
  recent: RecentSearches;
  /** The people who wrote the newest ~200 messages, most recent first: fetched once, on first use. */
  senders(): Promise<readonly Sender[]>;
}

const sessions = new WeakMap<object, SearchSession>();

export function searchSession(client: JmapClient): SearchSession {
  let session = sessions.get(client);
  if (!session) {
    const recent = new RecentSearches();
    let loaded: Promise<readonly Sender[]> | null = null;
    session = {
      recent,
      senders() {
        loaded ??= fetchSenders(client).catch(() => {
          loaded = null; // try again next time
          return [];
        });
        return loaded;
      },
    };
    sessions.set(client, session);
  }
  return session;
}

/** Who wrote the newest ~200 messages, most recent first, without the signed-in user (their own mail is in Sent). */
export async function fetchSenders(client: JmapClient): Promise<Sender[]> {
  const { list } = await client.email.queryAndGet(
    { sort: [{ property: "receivedAt", isAscending: false }], limit: SENDER_SAMPLE },
    { properties: ["from"] },
  );
  const me = client.hasSession ? client.session.username.toLowerCase() : "";
  const seen = new Map<string, Sender>();
  for (const email of list) {
    for (const from of email.from ?? []) {
      const address = from.email.toLowerCase();
      if (!address || address === me || seen.has(address)) continue;
      seen.set(address, { name: from.name?.trim() || null, email: from.email });
    }
  }
  return [...seen.values()];
}
