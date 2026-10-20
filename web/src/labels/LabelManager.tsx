// The label manager (settings, section "labels"): every label with show or
// hide in the navigation, "show if unread", a colour, rename, nest and
// delete, and a form to create one. Brief 12's settings page renders it.
//
//   <LabelManager />
//
// Show or hide is the mailbox's own isSubscribed (so IMAP clients agree), kept
// on the server. Colour and "show if unread" are per device (labelPrefs.ts).
// A sublabel follows its top-level label's visibility. System labels are
// listed but cannot be renamed, nested, hidden or deleted.

import type { Id } from "@postern/jmap";
import { Pencil, Tag, Trash2 } from "lucide-react";
import { useId, useMemo, useState, type FormEvent } from "react";
import { descendantIds, nestTargets, validateLabelName } from "../actions/labels";
import { LabelEditError } from "./labelEdits";
import { forgetLabelPrefs, LABEL_COLORS, type LabelColor } from "./labelPrefs";
import type { LabelNode } from "./labelsStore";
import "./labels.css";
import { useAccount } from "../auth";
import { useLabelPrefs } from "./useLabelPrefs";
import { useLabelOps } from "./useLabelOps";
import { useLabels } from "./useLabels";

interface Flat {
  node: LabelNode;
  /** The top-level label this one sits under (or is). */
  root: LabelNode;
}

function flatten(nodes: readonly LabelNode[]): Flat[] {
  const out: Flat[] = [];
  const walk = (node: LabelNode, root: LabelNode) => {
    out.push({ node, root });
    for (const child of node.children) walk(child, root);
  };
  for (const node of nodes) walk(node, node);
  return out;
}

const COLOR_TITLES: Record<LabelColor, string> = {
  red: "Red",
  orange: "Orange",
  yellow: "Yellow",
  green: "Green",
  teal: "Teal",
  blue: "Blue",
  purple: "Purple",
  pink: "Pink",
  gray: "Gray",
};

export function LabelManager() {
  const labels = useLabels();
  const { username } = useAccount();
  const { prefs, setPref } = useLabelPrefs();
  const ops = useLabelOps(null);
  const [status, setStatus] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [renaming, setRenaming] = useState<Id | null>(null);
  const [confirming, setConfirming] = useState<Id | null>(null);
  const [busy, setBusy] = useState(false);

  const rows = useMemo(() => flatten([...labels.tree, ...labels.hidden]), [labels.tree, labels.hidden]);
  const systemLabels = labels.labels.filter((l) => l.system !== null);

  async function run(work: () => Promise<string | void>): Promise<boolean> {
    setBusy(true);
    setStatus(null);
    try {
      const text = await work();
      if (text) setStatus({ kind: "ok", text });
      return true;
    } catch (err) {
      setStatus({ kind: "error", text: err instanceof LabelEditError ? err.message : "That didn't work. Try again." });
      return false;
    } finally {
      setBusy(false);
    }
  }

  if (labels.status === "loading") return <p className="labels-manager-status">Loading labels…</p>;
  if (labels.status === "error") {
    return (
      <p className="labels-manager-status" role="alert">
        Labels didn't load.{" "}
        <button type="button" className="btn btn-quiet" onClick={() => void labels.store.sync()}>
          Retry
        </button>
      </p>
    );
  }

  return (
    <div className="labels-manager">
      <p className="labels-manager-intro">
        Labels are folders: the ones you make here show up as folders in your phone's mail app, and the other way round. Colours and "show if unread" are
        kept in this browser only.
      </p>

      <NewLabelForm
        labels={labels.labels}
        busy={busy}
        onCreate={(name, parentId) =>
          run(async () => {
            await ops.edits.create(name, parentId);
            return `Label "${name.trim()}" created.`;
          })
        }
      />

      <p className="labels-manager-status" role="status">
        {status ? <span data-kind={status.kind}>{status.text}</span> : null}
      </p>

      {rows.length === 0 ? (
        <p className="labels-manager-intro">No labels yet.</p>
      ) : (
        <table className="labels-table">
          <caption>Your labels</caption>
          <thead>
            <tr>
              <th scope="col">Label</th>
              <th scope="col">Show in the list</th>
              <th scope="col">Show if unread</th>
              <th scope="col">Colour</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ node, root }) => {
              const { label } = node;
              const pref = prefs[label.id] ?? {};
              const isRoot = root === node;
              return (
                <tr key={label.id}>
                  <td>
                    {renaming === label.id ? (
                      <RenameForm
                        label={label}
                        all={labels.labels}
                        busy={busy}
                        onCancel={() => setRenaming(null)}
                        onSave={async (name, parentId) => {
                          const ok = await run(async () => {
                            if (name.trim() !== label.name) await ops.edits.rename(label.id, name);
                            if (parentId !== label.parentId) await ops.edits.nest(label.id, parentId);
                            return "Label updated.";
                          });
                          if (ok) setRenaming(null);
                        }}
                      />
                    ) : (
                      <span className="labels-name" style={{ "--depth": node.depth } as React.CSSProperties}>
                        <Tag className="labels-swatch" aria-hidden="true" data-label-color={pref.color} />
                        <span>{label.name}</span>
                      </span>
                    )}
                  </td>
                  <td>
                    <label>
                      <input
                        type="checkbox"
                        checked={root.label.isSubscribed}
                        disabled={busy || !isRoot}
                        title={isRoot ? undefined : "A sublabel follows its top-level label"}
                        aria-label={`Show ${label.name} in the list`}
                        onChange={(e) => void run(() => ops.edits.setSubscribed(label.id, e.target.checked))}
                      />
                    </label>
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      checked={pref.showIfUnread === true}
                      aria-label={`Show ${label.name} only if it has unread conversations`}
                      onChange={(e) => setPref(label.id, { showIfUnread: e.target.checked })}
                    />
                  </td>
                  <td>
                    <select
                      className="input"
                      aria-label={`Colour of ${label.name}`}
                      value={pref.color ?? ""}
                      onChange={(e) => setPref(label.id, { color: (e.target.value || null) as LabelColor | null })}
                    >
                      <option value="">None</option>
                      {LABEL_COLORS.map((c) => (
                        <option key={c} value={c}>
                          {COLOR_TITLES[c]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    {confirming === label.id ? (
                      <div className="labels-confirm" role="alertdialog" aria-label={`Delete ${label.name}`}>
                        <p>
                          Delete "{label.path}"?{" "}
                          {node.children.length > 0
                            ? `Its ${node.children.length === 1 ? "sublabel stays" : `${node.children.length} sublabels stay`} and move up one level. `
                            : ""}
                          Its conversations are kept: those with no other label go to All Mail.
                        </p>
                        <div className="labels-actions">
                          <button type="button" className="btn btn-quiet" onClick={() => setConfirming(null)}>
                            Cancel
                          </button>
                          <button
                            type="button"
                            className="btn btn-danger"
                            disabled={busy}
                            onClick={() =>
                              void run(async () => {
                                const result = await ops.edits.delete(label.id);
                                forgetLabelPrefs(username, label.id);
                                setConfirming(null);
                                return result.archived > 0
                                  ? `Label "${label.name}" deleted. ${result.archived} ${result.archived === 1 ? "conversation moved" : "conversations moved"} to All Mail.`
                                  : `Label "${label.name}" deleted.`;
                              }).then((ok) => ok || setConfirming(null))
                            }
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="labels-actions">
                        <button type="button" className="btn btn-quiet" disabled={busy} onClick={() => setRenaming(label.id)} aria-label={`Edit ${label.name}`}>
                          <Pencil aria-hidden="true" /> Edit
                        </button>
                        <button type="button" className="btn btn-quiet" disabled={busy} onClick={() => setConfirming(label.id)} aria-label={`Delete ${label.name}`}>
                          <Trash2 aria-hidden="true" /> Delete
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <p className="labels-manager-intro">
        System labels ({systemLabels.map((l) => l.title).join(", ")}) can't be renamed, hidden or deleted.
      </p>
    </div>
  );
}

function NewLabelForm({
  labels,
  busy,
  onCreate,
}: {
  labels: ReturnType<typeof useLabels>["labels"];
  busy: boolean;
  onCreate: (name: string, parentId: Id | null) => Promise<boolean>;
}) {
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const nameId = useId();
  const parentFieldId = useId();

  async function submit(event: FormEvent) {
    event.preventDefault();
    const problem = validateLabelName(name, parentId || null, labels);
    if (problem) return setError(problem);
    setError(null);
    if (await onCreate(name, parentId || null)) setName("");
  }

  return (
    <form className="labels-manager-new" onSubmit={(e) => void submit(e)}>
      <label htmlFor={nameId}>
        New label
        <input id={nameId} className="input" value={name} autoComplete="off" onChange={(e) => (setName(e.target.value), setError(null))} />
      </label>
      <label htmlFor={parentFieldId}>
        Nest under
        <select id={parentFieldId} className="input" value={parentId} onChange={(e) => setParentId(e.target.value)}>
          <option value="">(none)</option>
          {labels
            .filter((l) => l.system === null)
            .map((l) => (
              <option key={l.id} value={l.id}>
                {l.path}
              </option>
            ))}
        </select>
      </label>
      <button type="submit" className="btn btn-primary" disabled={busy}>
        Create
      </button>
      {error ? (
        <p className="labels-error" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}

function RenameForm({
  label,
  all,
  busy,
  onSave,
  onCancel,
}: {
  label: { id: Id; name: string; parentId: Id | null };
  all: ReturnType<typeof useLabels>["labels"];
  busy: boolean;
  onSave: (name: string, parentId: Id | null) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(label.name);
  const [parentId, setParentId] = useState<string>(label.parentId ?? "");
  const [error, setError] = useState<string | null>(null);
  const targets = nestTargets(all, label.id);
  const parentValid = parentId === "" || !descendantIds(all, label.id).has(parentId);

  function submit(event: FormEvent) {
    event.preventDefault();
    const problem = validateLabelName(name, parentId || null, all, label.id);
    if (problem || !parentValid) return setError(problem ?? "A label can't go inside itself.");
    setError(null);
    void onSave(name, parentId || null);
  }

  return (
    <form className="labels-rename" onSubmit={submit} onKeyDown={(e) => e.key === "Escape" && onCancel()}>
      <input className="input" autoFocus value={name} aria-label={`Name of ${label.name}`} autoComplete="off" onChange={(e) => (setName(e.target.value), setError(null))} />
      <select className="input" value={parentId} aria-label="Nest under" onChange={(e) => setParentId(e.target.value)}>
        <option value="">(top level)</option>
        {targets.map((l) => (
          <option key={l.id} value={l.id}>
            {l.path}
          </option>
        ))}
      </select>
      <button type="submit" className="btn btn-primary" disabled={busy}>
        Save
      </button>
      <button type="button" className="btn btn-quiet" onClick={onCancel}>
        Cancel
      </button>
      {error ? (
        <span className="labels-error" role="alert">
          {error}
        </span>
      ) : null}
    </form>
  );
}
