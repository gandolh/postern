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
import { ConfirmDialog } from "../list/ConfirmDialog";
import "../list/list.css";
import { useSaved } from "../settings/useSaved";
import { FILTERS_OFF_NOTE } from "./BlockSender";
import { describeActions, describeCriteria } from "./describe";
import { FilterEditor, type LabelChoice } from "./FilterEditor";
import { FOREIGN_NAME_MESSAGE, UNREADABLE_MESSAGE } from "./filterScript";
import { subscribePendingCriteria, takePendingCriteria } from "./likeThese";
import { useFilters } from "./store";
import { useApplyToExisting } from "./useApplyToExisting";
import "./filters.css";

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

  const labelChoices = useMemo<LabelChoice[]>(() => labels.labels.filter((l) => !l.system).map((l) => ({ id: l.id, title: l.path })), [labels.labels]);
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
    if (ok) setNotice(held ? `Saved, but ${FILTERS_OFF_NOTE.charAt(0).toLowerCase()}${FILTERS_OFF_NOTE.slice(1)}` : null);
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
    const ok = await runSave((s) => ({ ...s, filters: index === null ? [...s.filters, filter] : s.filters.map((f, i) => (i === index ? filter : f)) }));
    if (!ok) return;
    setEditing(null);
    if (applyExisting) await applyToExisting(filter);
  };

  if (status === "idle" || status === "loading") {
    return (
      <div className="settings-form" aria-busy="true">
        <h2 className="settings-heading">Filters</h2>
        <p className="settings-hint">Loading&hellip;</p>
      </div>
    );
  }
  if (status === "error" || !loaded) {
    return (
      <div className="settings-form">
        <h2 className="settings-heading">Filters</h2>
        <p className="settings-error" role="alert">
          Could not load your filters: {error ?? "unknown error"}
        </p>
        <div>
          <button type="button" className="btn" onClick={() => void store.load(true)}>
            Try again
          </button>
        </div>
      </div>
    );
  }

  const off = loaded.scriptId !== null && !loaded.active;
  return (
    <div className="settings-form filters-page">
      <section className="filters-section" aria-labelledby={`${id}-filters`}>
        <h2 id={`${id}-filters`} className="settings-heading">
          Filters
        </h2>
        <p className="settings-hint">
          Filters sort new mail as it arrives. Postern keeps them on your mail server, so they work on every device, even with Postern closed.
        </p>

        {loaded.problem?.kind === "foreign-name" ? (
          <p className="filters-banner" role="alert">
            {FOREIGN_NAME_MESSAGE}
          </p>
        ) : null}
        {loaded.problem?.kind === "unreadable" ? (
          <div className="filters-banner" role="alert">
            <p>
              {UNREADABLE_MESSAGE} ({loaded.problem.message})
            </p>
            <button type="button" className="btn" onClick={() => setConfirmReplace(true)}>
              Start over with no filters
            </button>
          </div>
        ) : null}
        {off && loaded.otherActive?.vacation ? (
          <div className="filters-banner" role="status">
            <p>
              {FILTERS_OFF_NOTE} Your mail server runs one filter script at a time, and the vacation responder is using it.
            </p>
            <button type="button" className="btn" disabled={saving} onClick={() => void save(() => store.turnOn())}>
              Turn filters on and the vacation responder off
            </button>
          </div>
        ) : off && !loaded.otherActive ? (
          <div className="filters-banner" role="status">
            <p>Filters are off.</p>
            <button type="button" className="btn" disabled={saving} onClick={() => void save(() => store.turnOn())}>
              Turn filters on
            </button>
          </div>
        ) : null}
        {loaded.otherActive && !loaded.otherActive.vacation ? (
          <p className="filters-banner" role="status">
            Your own filter script &ldquo;{loaded.otherActive.name}&rdquo; is the one running now. When you save here, Postern&rsquo;s filters take over and run
            &ldquo;{loaded.otherActive.name}&rdquo; after them, so nothing it does is lost.
          </p>
        ) : null}

        {set.filters.length === 0 ? (
          <p className="settings-hint">No filters yet.</p>
        ) : (
          <ol className="settings-list filters-list" aria-label="Your filters">
            {set.filters.map((f, i) => (
              <li key={i} className="filters-item">
                <div className="filters-item-text">
                  <p className="filters-item-line">
                    <span className="filters-item-key">Matches:</span> <span className="filters-item-value">{describeCriteria(f.criteria)}</span>
                  </p>
                  <p className="filters-item-line">
                    <span className="filters-item-key">Do this:</span> {describeActions(f.actions, labelTitle).join(", ")}
                  </p>
                </div>
                <div className="filters-item-actions">
                  <button type="button" className="btn btn-quiet" disabled={saving || blockedWrite} aria-label={`Edit filter ${i + 1}`} onClick={() => setEditing({ index: i, initial: f })}>
                    Edit
                  </button>
                  <button type="button" className="btn btn-quiet" disabled={saving || blockedWrite} aria-label={`Delete filter ${i + 1}`} onClick={() => setConfirmDelete(i)}>
                    Delete
                  </button>
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
            <button type="button" className="btn" disabled={saving || blockedWrite} onClick={() => setEditing({ index: null, initial: { criteria: emptyCriteria() } })}>
              Create a new filter
            </button>
          </div>
        )}

        {set.includes.length > 0 ? (
          <div className="filters-includes">
            <p className="settings-hint">
              After these filters your mail server also runs {set.includes.length === 1 ? "your own script" : "your own scripts"}{" "}
              {set.includes.map((n) => `“${n}”`).join(", ")}.
            </p>
            {set.includes.map((name) => (
              <button
                key={name}
                type="button"
                className="btn btn-quiet"
                disabled={saving}
                onClick={() => void runSave((s) => ({ ...s, includes: s.includes.filter((x) => x !== name) }))}
              >
                Stop running &ldquo;{name}&rdquo;
              </button>
            ))}
          </div>
        ) : null}
        {notice ? (
          <p className="settings-hint" role="status">
            {notice}
          </p>
        ) : null}
        {note}
      </section>

      <section className="settings-section" aria-labelledby={`${id}-blocked`}>
        <h2 id={`${id}-blocked`} className="settings-heading">
          Blocked addresses
        </h2>
        <p className="settings-hint">New messages from these addresses go to Spam. Block someone from the menu on one of their messages.</p>
        {set.blocked.length === 0 ? (
          <p className="settings-hint">You haven&rsquo;t blocked anyone.</p>
        ) : (
          <ul className="settings-list filters-blocked" aria-label="Blocked addresses">
            {set.blocked.map((address) => (
              <li key={address} className="filters-blocked-item">
                <span className="filters-address">{address}</span>
                <button
                  type="button"
                  className="btn btn-quiet"
                  disabled={saving || blockedWrite}
                  aria-label={`Unblock ${address}`}
                  onClick={() => void runSave((s) => ({ ...s, blocked: s.blocked.filter((b) => b !== address) }))}
                >
                  Unblock
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="settings-section" aria-labelledby={`${id}-spam`}>
        <h2 id={`${id}-spam`} className="settings-heading">
          Spam
        </h2>
        <p className="settings-hint">
          When you report a message as spam, or mark one as not spam, your mail server&rsquo;s spam filter learns from it. It retrains a few times a day, once it has
          seen enough of both kinds.
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
