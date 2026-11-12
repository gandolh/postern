// Settings → Filters: the filters (create, edit, delete), the blocked
// addresses (unblock), and a word on spam. Postern keeps all of it in one
// Sieve script on the mail server, so it works on every device and while
// Postern is closed. See ./filterScript.ts for how it shares the server with
// other scripts and the vacation responder.

import { emptyCriteria, emptyFilterSet, type FilterCriteria, type MailFilter } from "@postern/jmap";
import { useEffect, useId, useMemo, useState } from "react";
import { ensureAllMail } from "../actions/allMail";
import { useJmap } from "../auth";
import { useLabels } from "../labels/useLabels";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { useSaved } from "../settings/useSaved";
import { FILTERS_OFF_NOTE } from "./BlockSender";
import { describeActions, describeCriteria } from "./describe";
import { FilterEditor, type LabelChoice } from "./FilterEditor";
import { FOREIGN_NAME_MESSAGE, UNREADABLE_MESSAGE } from "./filterScript";
import { subscribePendingCriteria, takePendingCriteria } from "./likeThese";
import { useFilters } from "./store";
import { useApplyToExisting } from "./useApplyToExisting";
import { Button } from "../components/ui/Button";

type Editing = { index: number | null; initial: { criteria: FilterCriteria; actions?: MailFilter["actions"] } } | null;

export function FiltersSettings() {
  const id = useId();
  const client = useJmap();
  const filters = useFilters();
  const labels = useLabels();
  const applyToExisting = useApplyToExisting();
  const { note, save } = useSaved();
  const [editing, setEditing] = useState<Editing>(() => {
    const pending = takePendingCriteria();
    return pending ? { index: null, initial: { criteria: pending } } : null;
  });
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Fresh on every visit: the vacation responder or another app may have changed the active script.
  const filtersStore = filters.store;
  useEffect(() => {
    void filtersStore.load(true);
  }, [filtersStore]);

  // "Filter messages like these" while this page is already open.
  useEffect(
    () =>
      subscribePendingCriteria(() => {
        const pending = takePendingCriteria();
        if (pending) setEditing({ index: null, initial: { criteria: pending } });
      }),
    [],
  );

  const labelChoices = useMemo<LabelChoice[]>(
    () => labels.labels.filter((l) => !l.system).map((l) => ({ id: l.id, title: l.path })),
    [labels.labels],
  );
  const labelTitle = (labelId: string) => labelChoices.find((l) => l.id === labelId)?.title;

  const { status, loaded, error, saving, store } = filters;
  const set = loaded?.set ?? emptyFilterSet();
  const blockedWrite = loaded?.problem?.kind === "foreign-name";

  const runSave = async (change: Parameters<typeof store.save>[0], options?: Parameters<typeof store.save>[1]) => {
    setNotice(null);
    let held = false;
    const ok = await save(async () => {
      held = (await store.save(change, options)).heldByVacation;
    });
    // A newly included script shows in the list of scripts that run after the filters.
    if (ok)
      setNotice(held ? `Saved, but ${FILTERS_OFF_NOTE.charAt(0).toLowerCase()}${FILTERS_OFF_NOTE.slice(1)}` : null);
    return ok;
  };

  const saveFilter = async (index: number | null, filter: MailFilter, applyExisting: boolean) => {
    // Skip the Inbox files into All Mail; make sure it exists on this account.
    if (filter.actions.archive && labels.store.mailboxIdForRole("archive") === undefined) {
      try {
        await ensureAllMail(client, labels.store);
      } catch {
        // The script falls back to a label named Archive, then the Inbox.
      }
    }
    const ok = await runSave((s) => ({
      ...s,
      filters: index === null ? [...s.filters, filter] : s.filters.map((f, i) => (i === index ? filter : f)),
    }));
    if (!ok) return;
    setEditing(null);
    if (applyExisting) await applyToExisting(filter);
  };

  if (status === "idle" || status === "loading") {
    return (
      <div className="flex max-w-176 flex-col gap-6 p-6" aria-busy="true">
        <h2 className="m-0 text-lg font-semibold">Filters</h2>
        <p className="m-0 text-text-muted">Loading&hellip;</p>
      </div>
    );
  }
  if (status === "error" || !loaded) {
    return (
      <div className="flex max-w-176 flex-col gap-6 p-6">
        <h2 className="m-0 text-lg font-semibold">Filters</h2>
        <p className="text-danger" role="alert">
          Could not load your filters: {error ?? "unknown error"}
        </p>
        <div>
          <Button type="button" onClick={() => void store.load(true)}>
            Try again
          </Button>
        </div>
      </div>
    );
  }

  const off = loaded.scriptId !== null && !loaded.active;
  return (
    <div className="flex max-w-176 flex-col gap-6 p-6">
      <section className="flex flex-col gap-3" aria-labelledby={`${id}-filters`}>
        <h2 id={`${id}-filters`} className="m-0 text-lg font-semibold">
          Filters
        </h2>
        <p className="m-0 text-text-muted">
          Filters sort new mail as it arrives. Postern keeps them on your mail server, so they work on every device,
          even with Postern closed.
        </p>

        {loaded.problem?.kind === "foreign-name" ? (
          <p
            className="m-0 flex flex-col items-start gap-2 rounded-lg bg-warning-soft px-4 py-3 text-on-warning-soft [&_p]:m-0"
            role="alert"
          >
            {FOREIGN_NAME_MESSAGE}
          </p>
        ) : null}
        {loaded.problem?.kind === "unreadable" ? (
          <div
            className="m-0 flex flex-col items-start gap-2 rounded-lg bg-warning-soft px-4 py-3 text-on-warning-soft [&_p]:m-0"
            role="alert"
          >
            <p>
              {UNREADABLE_MESSAGE} ({loaded.problem.message})
            </p>
            <Button type="button" onClick={() => setConfirmReplace(true)}>
              Start over with no filters
            </Button>
          </div>
        ) : null}
        {off && loaded.otherActive?.vacation ? (
          <div
            className="m-0 flex flex-col items-start gap-2 rounded-lg bg-warning-soft px-4 py-3 text-on-warning-soft [&_p]:m-0"
            role="status"
          >
            <p>
              {FILTERS_OFF_NOTE} Your mail server runs one filter script at a time, and the vacation responder is using
              it.
            </p>
            <Button type="button" disabled={saving} onClick={() => void save(() => store.turnOn())}>
              Turn filters on and the vacation responder off
            </Button>
          </div>
        ) : off && !loaded.otherActive ? (
          <div
            className="m-0 flex flex-col items-start gap-2 rounded-lg bg-warning-soft px-4 py-3 text-on-warning-soft [&_p]:m-0"
            role="status"
          >
            <p>Filters are off.</p>
            <Button type="button" disabled={saving} onClick={() => void save(() => store.turnOn())}>
              Turn filters on
            </Button>
          </div>
        ) : null}
        {loaded.otherActive && !loaded.otherActive.vacation ? (
          <p
            className="m-0 flex flex-col items-start gap-2 rounded-lg bg-warning-soft px-4 py-3 text-on-warning-soft [&_p]:m-0"
            role="status"
          >
            Your own filter script &ldquo;{loaded.otherActive.name}&rdquo; is the one running now. When you save here,
            Postern&rsquo;s filters take over and run &ldquo;{loaded.otherActive.name}&rdquo; after them, so nothing it
            does is lost.
          </p>
        ) : null}

        {set.filters.length === 0 ? (
          <p className="m-0 text-text-muted">No filters yet.</p>
        ) : (
          <ol
            className="m-0 flex list-none flex-col gap-0 border-t border-border p-0 [&_li]:flex [&_li]:items-center [&_li]:justify-between [&_li]:gap-3"
            aria-label="Your filters"
          >
            {set.filters.map((f, i) => (
              <li key={i} className="flex items-start justify-between gap-3 border-b border-border py-3">
                <div className="min-w-0">
                  <p className="m-0 wrap-anywhere">
                    <span className="text-text-muted">Matches:</span>{" "}
                    <span className="font-mono text-sm">{describeCriteria(f.criteria)}</span>
                  </p>
                  <p className="m-0 wrap-anywhere">
                    <span className="text-text-muted">Do this:</span>{" "}
                    {describeActions(f.actions, labelTitle).join(", ")}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button
                    variant="quiet"
                    type="button"
                    disabled={saving || blockedWrite}
                    aria-label={`Edit filter ${i + 1}`}
                    onClick={() => setEditing({ index: i, initial: f })}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="quiet"
                    type="button"
                    disabled={saving || blockedWrite}
                    aria-label={`Delete filter ${i + 1}`}
                    onClick={() => setConfirmDelete(i)}
                  >
                    Delete
                  </Button>
                </div>
              </li>
            ))}
          </ol>
        )}

        {editing ? (
          <FilterEditor
            key={editing.index ?? "new"}
            initial={editing.initial}
            isNew={editing.index === null}
            labels={labelChoices}
            busy={saving}
            onSave={(filter, applyExisting) => void saveFilter(editing.index, filter, applyExisting)}
            onCancel={() => setEditing(null)}
          />
        ) : (
          <div>
            <Button
              type="button"
              disabled={saving || blockedWrite}
              onClick={() => setEditing({ index: null, initial: { criteria: emptyCriteria() } })}
            >
              Create a new filter
            </Button>
          </div>
        )}

        {set.includes.length > 0 ? (
          <div className="flex flex-col items-start gap-1">
            <p className="m-0 text-text-muted">
              After these filters your mail server also runs{" "}
              {set.includes.length === 1 ? "your own script" : "your own scripts"}{" "}
              {set.includes.map((n) => `“${n}”`).join(", ")}.
            </p>
            {set.includes.map((name) => (
              <Button
                variant="quiet"
                key={name}
                type="button"
                disabled={saving}
                onClick={() => void runSave((s) => ({ ...s, includes: s.includes.filter((x) => x !== name) }))}
              >
                Stop running &ldquo;{name}&rdquo;
              </Button>
            ))}
          </div>
        ) : null}
        {notice ? (
          <p className="m-0 text-text-muted" role="status">
            {notice}
          </p>
        ) : null}
        {note}
      </section>

      <section className="flex flex-col gap-3 border-t border-border pt-4" aria-labelledby={`${id}-blocked`}>
        <h2 id={`${id}-blocked`} className="m-0 text-lg font-semibold">
          Blocked addresses
        </h2>
        <p className="m-0 text-text-muted">
          New messages from these addresses go to Spam. Block someone from the menu on one of their messages.
        </p>
        {set.blocked.length === 0 ? (
          <p className="m-0 text-text-muted">You haven&rsquo;t blocked anyone.</p>
        ) : (
          <ul
            className="m-0 flex list-none flex-col gap-1 p-0 [&_li]:flex [&_li]:items-center [&_li]:justify-between [&_li]:gap-3"
            aria-label="Blocked addresses"
          >
            {set.blocked.map((address) => (
              <li key={address} className="flex min-h-10 items-center justify-between gap-3 border-b border-border">
                <span className="wrap-anywhere">{address}</span>
                <Button
                  variant="quiet"
                  type="button"
                  disabled={saving || blockedWrite}
                  aria-label={`Unblock ${address}`}
                  onClick={() => void runSave((s) => ({ ...s, blocked: s.blocked.filter((b) => b !== address) }))}
                >
                  Unblock
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3 border-t border-border pt-4" aria-labelledby={`${id}-spam`}>
        <h2 id={`${id}-spam`} className="m-0 text-lg font-semibold">
          Spam
        </h2>
        <p className="m-0 text-text-muted">
          When you report a message as spam, or mark one as not spam, your mail server&rsquo;s spam filter learns from
          it. It retrains a few times a day, once it has seen enough of both kinds.
        </p>
      </section>

      {confirmDelete !== null ? (
        <ConfirmDialog
          title="Delete this filter?"
          body="New mail stops being sorted by it. Mail it already sorted stays where it is."
          confirmLabel="Delete filter"
          onConfirm={() => {
            const index = confirmDelete;
            setConfirmDelete(null);
            void runSave((s) => ({ ...s, filters: s.filters.filter((_, i) => i !== index) }));
          }}
          onCancel={() => setConfirmDelete(null)}
        />
      ) : null}
      {confirmReplace ? (
        <ConfirmDialog
          title="Start over?"
          body="Postern replaces its filter script with an empty one. The filters and blocked addresses in the changed script are lost."
          confirmLabel="Start over"
          onConfirm={() => {
            setConfirmReplace(false);
            void runSave(() => emptyFilterSet(), { replaceUnreadable: true });
          }}
          onCancel={() => setConfirmReplace(false)}
        />
      ) : null}
    </div>
  );
}
