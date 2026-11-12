// "Delete all spam messages now" (Spam) and "Empty Trash now" (Trash), at the
// top of those lists as in Gmail. Counts first, asks, then deletes forever.

import { useState } from "react";
import { publishMailChange, publishPending } from "../actions/bus";
import { isQuietError } from "../actions/runner";
import {
  emptyConfirmText,
  emptyDoneText,
  emptyLabel,
  listEmptyable,
  type EmptyableLabel,
  type EmptyPlan,
} from "../actions/spam";
import { rolesFrom } from "../actions/useMailActions";
import { useJmap } from "../auth";
import { useLabelsStore } from "../labels/useLabels";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { useToast } from "../components/ui/Toast";
import { Button } from "../components/ui/Button";

export function EmptyLabelButton({ label }: { label: EmptyableLabel }) {
  const client = useJmap();
  const labels = useLabelsStore();
  const toast = useToast();
  const [plan, setPlan] = useState<EmptyPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const where = label === "junk" ? "Spam" : "Trash";

  const ask = async () => {
    setBusy(true);
    try {
      const p = await listEmptyable(client, rolesFrom(labels), label);
      if (p.destroy.length === 0 && p.release.length === 0) toast.show({ message: `${where} is already empty.` });
      else setPlan(p);
    } catch (e) {
      // Session trouble is the sign-in layer's to show.
      if (!isQuietError(e))
        toast.show({
          message: `Couldn't empty ${where}: ${e instanceof Error ? e.message : "unknown error"}`,
          duration: null,
        });
    } finally {
      setBusy(false);
    }
  };

  // The dialog stays up, saying so, until the server has answered.
  const run = async (p: EmptyPlan) => {
    setBusy(true);
    // Hide them at once in every list; "settled" below brings back anything the server kept.
    const answered = publishPending(Object.fromEntries(p.destroy.map((id) => [id, { mailboxIds: {} }])));
    try {
      const result = await emptyLabel(client, p);
      answered();
      toast.show({ message: emptyDoneText(label, result) });
    } catch (e) {
      answered();
      if (!isQuietError(e))
        toast.show({
          message: `Couldn't empty ${where}: ${e instanceof Error ? e.message : "unknown error"}`,
          duration: null,
        });
    } finally {
      answered();
      setPlan(null);
      setBusy(false);
      void labels.sync();
      publishMailChange({ kind: "settled" });
    }
  };

  const text = plan ? emptyConfirmText(plan) : null;
  return (
    <>
      <Button
        variant="quiet"
        type="button"
        className="min-h-8 px-3 text-md whitespace-nowrap"
        disabled={busy}
        onClick={() => void ask()}
      >
        {label === "junk" ? "Delete all spam messages now" : "Empty Trash now"}
      </Button>
      {plan && text ? (
        <ConfirmDialog
          title={text.title}
          body={text.body}
          confirmLabel={text.confirm}
          pendingLabel="Emptying…"
          onConfirm={() => run(plan)}
          onCancel={() => setPlan(null)}
        />
      ) : null}
    </>
  );
}
