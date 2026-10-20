// Contacts in the search box: typing `from:bo` (or a bare word) offers saved
// contacts by name or address. Brief 10's SuggestionSource interface.

import type { JmapClient } from "@postern/jmap";
import { quoteArg, replaceToken, type SuggestionSource } from "../search/suggestions";
import { contactsDirectory } from "./directory";

export function contactsSource(client: JmapClient, limit = 5): SuggestionSource {
  return {
    id: "contacts",
    heading: "Contacts",
    async suggest(q, signal) {
      const operator = q.operator;
      if (operator !== null && operator !== "from" && operator !== "to" && operator !== "cc" && operator !== "bcc") return [];
      if (operator === null && q.rest.length < 2) return [];
      if (!q.rest) return [];
      const directory = contactsDirectory(client);
      await directory.ensureFresh(signal);
      return directory.search(q.rest, limit).map((c) => ({
        key: c.email,
        label: c.name || c.email,
        detail: c.name ? c.email : undefined,
        text: replaceToken(q, `${q.negation}${operator ?? "from"}:${quoteArg(c.email)}`),
      }));
    },
  };
}
