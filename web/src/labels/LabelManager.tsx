// The label manager (settings, section "labels"): every label with show or
// hide in the navigation, "show if unread", a colour, rename, nest and
// delete, and a form to create one. The settings page renders it.
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
import { useAccount } from "../auth";
import { useLabelPrefs } from "./useLabelPrefs";
import { useLabelOps } from "./useLabelOps";
import { useLabels } from "./useLabels";
import { Button } from "../components/ui/Button";
import { Input, inputClass } from "../components/ui/Input";

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

  if (labels.status === "loading") return <p className="text-md text-text-muted">Loading labels…</p>;
  if (labels.status === "error") {
    return (
      <p className="text-md text-text-muted" role="alert">
        Labels didn't load.{" "}
        <Button variant="quiet" type="button" onClick={() => void labels.store.sync()}>
          Retry
        </Button>
      </p>
    );
  }

  return (
    <div className="flex max-w-208 flex-col gap-4 p-4 max-sm:[&_td_input[type=checkbox]]:m-0 max-sm:[&_td_input[type=checkbox]]:size-6 max-sm:[&_td>label]:inline-grid max-sm:[&_td>label]:size-11 max-sm:[&_td>label]:place-items-center">
      <p className="text-md text-text-muted">
        Labels are folders: the ones you make here show up as folders in your phone's mail app, and the other way round.
        Colours and "show if unread" are kept in this browser only.
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

      <p className="text-md text-text-muted" role="status">
        {status ? <span data-kind={status.kind}>{status.text}</span> : null}
      </p>

      {rows.length === 0 ? (
        <p className="text-md text-text-muted">No labels yet.</p>
      ) : (
        <table className="w-full border-collapse text-md [&_caption]:pb-2 [&_caption]:text-start [&_caption]:text-lg [&_caption]:font-semibold [&_td]:border-b [&_td]:border-border [&_td]:px-3 [&_td]:py-2 [&_td]:text-start [&_td]:align-middle [&_th]:border-b [&_th]:border-border [&_th]:px-3 [&_th]:py-2 [&_th]:text-start [&_th]:align-middle [&_th]:text-sm [&_th]:font-semibold [&_th]:text-text-muted">
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
                      <span
                        className="flex items-center gap-2 ps-[calc(var(--depth,0)*1rem)]"
                        style={{ "--depth": node.depth } as React.CSSProperties}
                      >
                        <Tag
                          className="size-4 flex-none fill-[var(--label-fill,transparent)] text-[var(--label-color,var(--color-text-subtle))]"
                          aria-hidden="true"
                          data-label-color={pref.color}
                        />
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
                      className={inputClass()}
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
                      <div
                        className="flex flex-col gap-2 rounded-md border border-border-strong bg-surface-sunken p-3"
                        role="alertdialog"
                        aria-label={`Delete ${label.name}`}
                      >
                        <p>
                          Delete "{label.path}"?{" "}
                          {node.children.length > 0
                            ? `Its ${node.children.length === 1 ? "sublabel stays" : `${node.children.length} sublabels stay`} and move up one level. `
                            : ""}
                          Its conversations are kept: those with no other label go to All Mail.
                        </p>
                        <div className="flex flex-wrap gap-1">
                          <Button variant="quiet" type="button" onClick={() => setConfirming(null)}>
                            Cancel
                          </Button>
                          <Button
                            type="button"
                            className="border-transparent bg-danger text-surface"
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
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        <Button
                          variant="quiet"
                          type="button"
                          disabled={busy}
                          onClick={() => setRenaming(label.id)}
                          aria-label={`Edit ${label.name}`}
                        >
                          <Pencil aria-hidden="true" /> Edit
                        </Button>
                        <Button
                          variant="quiet"
                          type="button"
                          disabled={busy}
                          onClick={() => setConfirming(label.id)}
                          aria-label={`Delete ${label.name}`}
                        >
                          <Trash2 aria-hidden="true" /> Delete
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <p className="text-md text-text-muted">
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
    <form
      className="flex flex-wrap items-end gap-3 [&_label]:flex [&_label]:flex-col [&_label]:gap-1 [&_label]:text-sm [&_label]:text-text-muted"
      onSubmit={(e) => void submit(e)}
    >
      <label htmlFor={nameId}>
        New label
        <Input
          id={nameId}
          value={name}
          autoComplete="off"
          onChange={(e) => (setName(e.target.value), setError(null))}
        />
      </label>
      <label htmlFor={parentFieldId}>
        Nest under
        <select
          id={parentFieldId}
          className={inputClass()}
          value={parentId}
          onChange={(e) => setParentId(e.target.value)}
        >
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
      <Button variant="primary" type="submit" disabled={busy}>
        Create
      </Button>
      {error ? (
        <p className="text-sm text-danger" role="alert">
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
    <form
      className="flex gap-2 [&_:is(input,select)]:min-h-9 [&_:is(input,select)]:text-md"
      onSubmit={submit}
      onKeyDown={(e) => e.key === "Escape" && onCancel()}
    >
      <Input
        autoFocus
        value={name}
        aria-label={`Name of ${label.name}`}
        autoComplete="off"
        onChange={(e) => (setName(e.target.value), setError(null))}
      />
      <select
        className={inputClass()}
        value={parentId}
        aria-label="Nest under"
        onChange={(e) => setParentId(e.target.value)}
      >
        <option value="">(top level)</option>
        {targets.map((l) => (
          <option key={l.id} value={l.id}>
            {l.path}
          </option>
        ))}
      </select>
      <Button variant="primary" type="submit" disabled={busy}>
        Save
      </Button>
      <Button variant="quiet" type="button" onClick={onCancel}>
        Cancel
      </Button>
      {error ? (
        <span className="text-sm text-danger" role="alert">
          {error}
        </span>
      ) : null}
    </form>
  );
}
