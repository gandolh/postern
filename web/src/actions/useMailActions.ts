// The mail actions for React: the runner (./runner) on the signed-in client,
// the labels store and the shell's toast.
//
//   const actions = useMailActions();
//   await actions.archive([conversation], scope);

import { useMemo } from "react";
import { useJmap } from "../auth";
import type { LabelsStore } from "../labels/labelsStore";
import { useLabelsStore } from "../labels/useLabels";
import { useToast } from "../shell/toast";
import { ensureSnoozedLabel } from "../snooze/label";
import { ensureAllMail } from "./allMail";
import { ROLE_NAMES, type MailboxRoles } from "./conversation";
import { createMailActions, type MailActions } from "./runner";

/** The account's system labels by role, from the labels store. */
export function rolesFrom(labels: Pick<LabelsStore, "mailboxIdForRole">): MailboxRoles {
  const roles: MailboxRoles = {};
  for (const role of ROLE_NAMES) {
    const id = labels.mailboxIdForRole(role);
    if (id !== undefined) roles[role] = id;
  }
  return roles;
}

export function useMailActions(): MailActions {
  const client = useJmap();
  const labels = useLabelsStore();
  const toast = useToast();
  return useMemo(
    () =>
      createMailActions({
        caller: client,
        roles: () => rolesFrom(labels),
        ensureAllMail: () => ensureAllMail(client, labels),
        ensureSnoozed: () => ensureSnoozedLabel(client, labels),
        snoozedId: () => labels.snoozedId(),
        syncLabels: () => void labels.sync(),
        toast,
      }),
    [client, labels, toast],
  );
}
