// "Delete all spam messages now" (Spam) and "Empty Trash now" (Trash), at the
// top of those lists as in Gmail. Counts first, asks, then deletes forever.

import { isAbortError } from "@postern/jmap";
import { useState } from "react";
import { publishMailChange } from "../actions/bus";
import { emptyConfirmText, emptyDoneText, emptyLabel, listEmptyable, type EmptyableLabel, type EmptyPlan } from "../actions/spam";
import { rolesFrom } from "../actions/useMailActions";
import { useJmap } from "../auth";
import { useLabelsStore } from "../labels/useLabels";
import { ConfirmDialog } from "../list/ConfirmDialog";
import "../list/list.css";
import { useToast } from "../shell/toast";
import "./filters.css";

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
      if (!isAbortError(e)) toast.show({ message: `Couldn't empty ${where}: ${e instanceof Error ? e.message : "unknown error"}` });
    } finally {
      setBusy(false);
    }
  };

  const run = async (p: EmptyPlan) => {
    setPlan(null);
    setBusy(true);
    // Hide them at once in every list; "settled" below brings back anything the server kept.
    publishMailChange({ kind: "patch", update: Object.fromEntries(p.destroy.map((id) => [id, { mailboxIds: {} }])) });
    try {
      const result = await emptyLabel(client, p);
      toast.show({ message: emptyDoneText(label, result) });
    } catch (e) {
      if (!isAbortError(e)) toast.show({ message: `Couldn't empty ${where}: ${e instanceof Error ? e.message : "unknown error"}` });
    } finally {
      setBusy(false);
      void labels.sync();
      publishMailChange({ kind: "settled" });
    }
  };

  const text = plan ? emptyConfirmText(plan) : null;
  return (
    <>
      <button type="button" className="btn btn-quiet list-text-btn filters-empty-btn" disabled={busy} onClick={() => void ask()}>
        {label === "junk" ? "Delete all spam messages now" : "Empty Trash now"}
      </button>
      {plan && text ? <ConfirmDialog title={text.title} body={text.body} confirmLabel={text.confirm} onConfirm={() => void run(plan)} onCancel={() => setPlan(null)} /> : null}
    </>
  );
}
