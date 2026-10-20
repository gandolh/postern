// The label menu (brief 09): Gmail's Labels button (a checkbox per label, with
// a search box and "Create new") and its Move to twin. Brief 06's toolbar
// renders it for the selection; brief 14's `l` and `v` render
// <LabelMenuPopover> for the focused conversation.
//
//   <LabelMenu conversationIds emailIds current mode onDone />   the toolbar button + its menu
//   <LabelMenuPanel ... onClose />                                just the menu's content
//   <LabelMenuPopover open onClose ... />                         the panel in a floating box (keyboard)
//
// Choices apply at once (optimistic, with the toast and Undo of brief 06's
// actions) and the Labels menu stays open, so several labels can be set in a
// row; Move to closes. A label carried by only some of the selected
// conversations shows as indeterminate; clicking it puts it on all of them.

import type { Id } from "@postern/jmap";
import { ArrowRightToLine, Plus, Search, Tag } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { filterLabels, labelChecks, validateLabelName, type LabelCheck } from "../actions/labels";
import { rolesFrom } from "../actions";
import { useJmap } from "../auth";
import { IconButton } from "../shell/IconButton";
import type { LabelRoute } from "../shell/router";
import { isAllSelected, resolveConversations, scopeFor } from "./conversations";
import { LabelEditError } from "./labelEdits";
import type { Label } from "./labelsStore";
import "./labels.css";
import { useLabelColor } from "./useLabelPrefs";
import { useLabels } from "./useLabels";
import { useLabelOps } from "./useLabelOps";

export interface LabelMenuProps {
  /** The selected conversations (JMAP Thread ids). */
  conversationIds: readonly Id[];
  /** Their messages (JMAP Email ids): what the `mailboxIds` patches apply to. */
  emailIds: readonly Id[];
  /** The label being viewed, for "Move to" (which removes it) and to leave it out of the list; null in search results. */
  current: LabelRoute | null;
  /** `label` (apply/remove, Gmail's Labels button) or `move` (Gmail's Move to). Default `label`. */
  mode?: "label" | "move";
  /** Called after the menu applied a change or closed. */
  onDone?: () => void;
}

export function LabelMenu({ conversationIds, emailIds, current, mode = "label", onDone }: LabelMenuProps) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement & HTMLAnchorElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) buttonRef.current?.focus();
  };

  return (
    <div ref={wrapRef} className="list-menu">
      <IconButton
        ref={buttonRef}
        label={mode === "move" ? "Move to" : "Labels"}
        icon={mode === "move" ? ArrowRightToLine : Tag}
        disabled={conversationIds.length === 0}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen((o) => !o)}
      />
      {open ? (
        <div id={id} className="labels-popup">
          <LabelMenuPanel conversationIds={conversationIds} emailIds={emailIds} current={current} mode={mode} onDone={onDone} onClose={close} />
        </div>
      ) : null}
    </div>
  );
}

export interface LabelMenuPopoverProps extends LabelMenuProps {
  open: boolean;
  /** Escape, a click outside, or the choice made (Move to). */
  onClose: () => void;
}

/** The menu floating over the page, for the keyboard (`l`, `v`): centred near the top, closes on Escape or a click outside. */
export function LabelMenuPopover({ open, onClose, ...props }: LabelMenuPopoverProps) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) onClose();
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div ref={ref} className="labels-popup labels-popup-floating" role="dialog" aria-label={props.mode === "move" ? "Move to" : "Labels"}>
      <LabelMenuPanel {...props} onClose={() => onClose()} />
    </div>
  );
}

interface PanelProps extends LabelMenuProps {
  /** Close the menu; `refocus` returns focus to its button. */
  onClose: (refocus: boolean) => void;
}

type Mode = "label" | "move";

function optionsFor(labels: readonly Label[], mode: Mode, currentId: Id | undefined): Label[] {
  if (mode === "label") return labels.filter((l) => l.system === null);
  // Move to: Inbox, Spam, Trash and the user labels, but not where you already are.
  const wanted = new Set(["inbox", "spam", "trash"]);
  return labels.filter((l) => l.id !== currentId && (l.system === null || (l.system !== null && wanted.has(l.system))));
}

export function LabelMenuPanel({ conversationIds, current, mode = "label", onDone, onClose }: PanelProps) {
  const client = useJmap();
  const labels = useLabels();
  const ops = useLabelOps(current);
  const [query, setQuery] = useState("");
  const [checks, setChecks] = useState<ReadonlyMap<Id, LabelCheck>>(new Map());
  const [ready, setReady] = useState(mode === "move");
  const [creating, setCreating] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  const currentId = useMemo(() => {
    if (!current) return undefined;
    return current.kind === "label" ? current.labelId : labels.system[current.view].label?.id;
  }, [current, labels.system]);
  const options = useMemo(() => optionsFor(labels.labels, mode, currentId), [labels.labels, mode, currentId]);
  const shown = useMemo(() => filterLabels(options.map((l) => ({ ...l, title: l.title, path: l.system ? l.title : l.path })), query), [options, query]);
  const all = isAllSelected(conversationIds);

  // What the selection carries now (the label menu's checkboxes).
  const idsKey = conversationIds.join(",");
  useEffect(() => {
    if (mode !== "label") return;
    let live = true;
    void resolveConversations(client, conversationIds, { all }).then(
      (conversations) => {
        if (!live) return;
        const roles = rolesFrom(labels.store);
        setChecks(labelChecks(conversations, scopeFor(current, roles), options.map((l) => l.id)));
        setReady(true);
      },
      () => live && setReady(true),
    );
    return () => {
      live = false;
    };
    // The checkboxes are read once per open (and when the selection changes), then kept by the clicks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, mode, all]);

  useEffect(() => searchRef.current?.focus(), []);

  async function choose(label: { id: Id }) {
    if (mode === "move") {
      onClose(false);
      const outcome = await ops.move(conversationIds, label.id, { all });
      if (outcome !== "failed" && outcome !== "nothing") onDone?.();
      return;
    }
    const before = checks.get(label.id) ?? "unchecked";
    const on = before !== "checked";
    setChecks((c) => new Map(c).set(label.id, on ? "checked" : "unchecked"));
    const outcome = await ops.apply(conversationIds, label.id, on, { all });
    if (outcome === "failed") setChecks((c) => new Map(c).set(label.id, before));
    else onDone?.();
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose(true);
      return;
    }
    const items = [...(listRef.current?.querySelectorAll<HTMLElement>("[data-label-option]") ?? [])];
    const focusables = [searchRef.current, ...items].filter((el): el is HTMLElement => el !== null);
    const at = focusables.indexOf(document.activeElement as HTMLElement);
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const next = focusables[(at + (event.key === "ArrowDown" ? 1 : -1) + focusables.length) % focusables.length];
      next?.focus();
    }
  }

  if (creating) {
    return (
      <div className="labels-panel" onKeyDown={(e) => e.key === "Escape" && (e.stopPropagation(), setCreating(false))}>
        <CreateForm
          initialName={query.trim()}
          mode={mode}
          onCancel={() => setCreating(false)}
          onCreate={async (name, parentId) => {
            const id = await ops.edits.create(name, parentId);
            if (mode === "move") {
              onClose(false);
              const outcome = await ops.move(conversationIds, id, { all });
              if (outcome !== "failed" && outcome !== "nothing") onDone?.();
            } else {
              setChecks((c) => new Map(c).set(id, "checked"));
              setCreating(false);
              setQuery("");
              const outcome = await ops.apply(conversationIds, id, true, { all });
              if (outcome !== "failed") onDone?.();
            }
          }}
        />
      </div>
    );
  }

  const heading = mode === "move" ? "Move to" : "Label as";
  return (
    <div className="labels-panel" onKeyDown={onKeyDown} role="group" aria-labelledby={titleId}>
      <p id={titleId} className="labels-heading">
        {heading}
      </p>
      <label className="labels-search">
        <Search aria-hidden="true" />
        <input
          ref={searchRef}
          type="text"
          className="labels-search-input"
          placeholder={mode === "move" ? "Move to" : "Search labels"}
          aria-label={mode === "move" ? "Search for a label to move to" : "Search labels"}
          autoComplete="off"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && shown.length === 1 && ready) {
              e.preventDefault();
              void choose(shown[0]!);
            }
          }}
        />
      </label>
      <div ref={listRef} className="labels-options" role={mode === "move" ? "menu" : "group"} aria-label={mode === "move" ? "Destinations" : "Labels"}>
        {!ready ? (
          <p className="labels-note">Loading…</p>
        ) : shown.length === 0 ? (
          <p className="labels-note">{options.length === 0 ? "No labels yet" : "No labels match"}</p>
        ) : (
          shown.map((label) =>
            mode === "label" ? (
              <CheckOption key={label.id} label={label} check={checks.get(label.id) ?? "unchecked"} onToggle={() => void choose(label)} />
            ) : (
              <MoveOption key={label.id} label={label} onChoose={() => void choose(label)} />
            )
          )
        )}
      </div>
      <button type="button" className="labels-create" onClick={() => setCreating(true)}>
        <Plus aria-hidden="true" />
        Create new
      </button>
    </div>
  );
}

function Swatch({ id }: { id: Id }) {
  const color = useLabelColor(id);
  return <Tag className="labels-swatch" aria-hidden="true" data-label-color={color} />;
}

function CheckOption({ label, check, onToggle }: { label: Pick<Label, "id" | "path">; check: LabelCheck; onToggle: () => void }) {
  return (
    <label className="labels-option">
      <input
        type="checkbox"
        data-label-option=""
        checked={check === "checked"}
        ref={(el) => {
          if (el) el.indeterminate = check === "indeterminate";
        }}
        onChange={onToggle}
      />
      <Swatch id={label.id} />
      <span className="labels-option-name">{label.path}</span>
    </label>
  );
}

function MoveOption({ label, onChoose }: { label: Pick<Label, "id" | "path">; onChoose: () => void }) {
  return (
    <button type="button" role="menuitem" data-label-option="" className="labels-option labels-option-button" onClick={onChoose}>
      <Swatch id={label.id} />
      <span className="labels-option-name">{label.path}</span>
    </button>
  );
}

interface CreateFormProps {
  initialName: string;
  mode: Mode;
  onCancel: () => void;
  onCreate: (name: string, parentId: Id | null) => Promise<void>;
}

/** "Create new": a name, and optionally the label to nest it under (Gmail's dialog, inline). */
function CreateForm({ initialName, mode, onCancel, onCreate }: CreateFormProps) {
  const labels = useLabels();
  const [name, setName] = useState(initialName);
  const [parentId, setParentId] = useState<Id | "">("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const nameId = useId();
  const parentFieldId = useId();
  const parents = labels.labels.filter((l) => l.system === null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const problem = validateLabelName(name, parentId || null, labels.labels);
    if (problem) return setError(problem);
    setBusy(true);
    try {
      await onCreate(name, parentId || null);
    } catch (err) {
      setError(err instanceof LabelEditError ? err.message : "Couldn't create the label. Try again.");
      setBusy(false);
    }
  }

  return (
    <form className="labels-create-form" onSubmit={(e) => void submit(e)}>
      <p className="labels-heading">New label</p>
      <label htmlFor={nameId}>Label name</label>
      <input id={nameId} className="input" autoFocus value={name} onChange={(e) => (setName(e.target.value), setError(null))} autoComplete="off" />
      <label htmlFor={parentFieldId}>Nest label under</label>
      <select id={parentFieldId} className="input" value={parentId} onChange={(e) => setParentId(e.target.value)}>
        <option value="">(none)</option>
        {parents.map((l) => (
          <option key={l.id} value={l.id}>
            {l.path}
          </option>
        ))}
      </select>
      {error ? (
        <p className="labels-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="labels-create-actions">
        <button type="button" className="btn btn-quiet" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {mode === "move" ? "Create and move" : "Create and apply"}
        </button>
      </div>
    </form>
  );
}
