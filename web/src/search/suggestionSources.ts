import type { JmapClient } from "@postern/jmap";
import { useMemo } from "react";
import { useJmap } from "../auth";
import { contactsSource } from "../contacts/searchSource";
import { useLabels } from "../labels/useLabels";
import { searchSession, type SearchSession } from "./session";
import { labelSource, recentSearchSource, senderSource, type SuggestibleLabel, type SuggestionSource } from "./suggestions";

/**
 * The sources the search box asks, in the order their groups appear. Brief 15
 * adds contacts by returning one more source here (before the senders, which
 * it replaces for people it knows).
 */
export function useSuggestionSources(): { sources: SuggestionSource[]; session: SearchSession; client: JmapClient } {
  const client = useJmap();
  const { labels } = useLabels();
  const session = useMemo(() => searchSession(client), [client]);
  // Rebuilt only when a label is added, renamed or removed, not when a count moves.
  const key = JSON.stringify(labels.map((l) => [l.system ? l.title : l.path, l.system !== null]));
  const sources = useMemo<SuggestionSource[]>(() => {
    const list = (JSON.parse(key) as [string, boolean][]).map(([path, system]): SuggestibleLabel => ({ path, system }));
    return [recentSearchSource(session.recent), labelSource(() => list), contactsSource(client), senderSource(() => session.senders())];
  }, [session, client, key]);
  return { sources, session, client };
}
