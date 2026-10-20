// "Also apply to matching conversations": search with the filter's criteria
// and do its actions to what is found, through the mail actions (optimistic,
// one toast, one Undo).

import { createLabelResolver, parseSearch, type MailFilter } from "@postern/jmap";
import { useCallback } from "react";
import { ensureAllMail } from "../actions/allMail";
import { actionCopy } from "../actions/runner";
import { rolesFrom, useMailActions } from "../actions/useMailActions";
import { useJmap } from "../auth";
import { useLabels } from "../labels/useLabels";
import { useToast } from "../shell/toast";
import { criteriaToSearch, findMatchingConversations, planFilterActions } from "./retroactive";

export const APPLY_COPY = actionCopy(
  "Filter applied to 1 conversation.",
  "Filter applied to {n} conversations.",
  "Couldn't apply the filter to the conversation.",
  "Couldn't apply the filter to {n} conversations.",
);

export function useApplyToExisting(): (filter: MailFilter) => Promise<void> {
  const client = useJmap();
  const labels = useLabels();
  const actions = useMailActions();
  const toast = useToast();
  const store = labels.store;
  const userLabels = labels.labels;

  return useCallback(
    async (filter: MailFilter) => {
      let roles = rolesFrom(store);
      const parsed = parseSearch(criteriaToSearch(filter.criteria), {
        now: new Date(),
        roles,
        labels: createLabelResolver(userLabels.filter((l) => !l.system).map((l) => ({ id: l.id, path: l.path }))),
        utcOffsetMinutes: -new Date().getTimezoneOffset(),
      });
      let found;
      try {
        found = await findMatchingConversations(client, parsed.filter);
      } catch (e) {
        toast.show({ message: `Couldn't look for matching conversations: ${e instanceof Error ? e.message : "unknown error"}` });
        return;
      }
      if (found.conversations.length === 0) {
        toast.show({ message: "No conversations match this filter yet." });
        return;
      }
      if (filter.actions.archive && roles.archive === undefined) {
        try {
          roles = { ...roles, archive: await ensureAllMail(client, store) };
        } catch {
          toast.show({ message: APPLY_COPY.failed(found.conversations.length) });
          return;
        }
      }
      const scope = { kind: parsed.scope, roles };
      await actions.run(() => planFilterActions(found.conversations, scope, filter.actions), APPLY_COPY);
    },
    [client, store, userLabels, actions, toast],
  );
}
