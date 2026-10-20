import { createLabelResolver, parseSearch, type ParsedSearch, type SearchRoles } from "@postern/jmap";
import { useMemo } from "react";
import type { LabelsStore } from "../labels/labelsStore";
import { useLabels } from "../labels/useLabels";

/**
 * `query` parsed against the account's labels. Waits (returns null) until the
 * labels are loaded: `label:Work` needs them. The result keeps its identity
 * while nothing it depends on changes, and `now` is fixed per query, so the
 * list's query key stays put.
 */
export function useParsedSearch(query: string): ParsedSearch | null {
  const labels = useLabels();
  const ready = labels.status === "ready";
  const store = labels.store;
  // Only role ids and label paths matter, not the counts that change under them.
  const key = ready ? JSON.stringify([labels.labels.filter((l) => !l.system).map((l) => [l.id, l.path]), rolesOf(store)]) : "";
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const now = useMemo(() => new Date(), [query]);
  return useMemo(() => {
    if (!ready) return null;
    const [userLabels, roles] = JSON.parse(key) as [[string, string][], SearchRoles];
    return parseSearch(query, {
      now,
      roles,
      labels: createLabelResolver(userLabels.map(([id, path]) => ({ id, path }))),
      utcOffsetMinutes: -new Date().getTimezoneOffset(),
    });
  }, [query, now, key, ready]);
}

function rolesOf(store: LabelsStore): SearchRoles {
  const roles: SearchRoles = {};
  for (const role of ["inbox", "sent", "drafts", "junk", "trash", "archive"] as const) {
    const id = store.mailboxIdForRole(role);
    if (id !== undefined) roles[role] = id;
  }
  return roles;
}
