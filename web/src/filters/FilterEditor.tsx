// The filter form, Gmail's two steps on one page: what to match (From, To,
// Subject, Has the words, Doesn't have, Size, Has attachment), then what to do
// (skip the Inbox, mark as read, star, apply a label, forward, delete, never
// send to Spam), and "Also apply to matching conversations".

import {
  emptyActions,
  filterProblems,
  isAddress,
  joinWords,
  normalizeFilter,
  splitList,
  splitWords,
  type FilterCriteria,
  type MailFilter,
  type SizeCriterion,
} from "@postern/jmap";
import { useId, useMemo, useState, type FormEvent } from "react";
import { formatRoute } from "../shell/router";
import { criteriaToSearch, hasRetroactiveActions } from "./retroactive";

export interface LabelChoice {
  id: string;
  /** The label's path ("Work/Clients"). */
  title: string;
}

export interface FilterEditorProps {
  /** The filter being edited, or a new one's starting point. */
  initial: { criteria: FilterCriteria; actions?: MailFilter["actions"] };
  isNew: boolean;
  labels: readonly LabelChoice[];
  busy: boolean;
  onSave(filter: MailFilter, applyToExisting: boolean): void;
  onCancel(): void;
}

interface FormState {
  from: string;
  to: string;
  subject: string;
  words: string;
  notWords: string;
  hasAttachment: boolean;
  sizeOn: boolean;
  sizeComparison: SizeCriterion["comparison"];
  sizeAmount: string;
  sizeUnit: SizeCriterion["unit"];
  archive: boolean;
  markRead: boolean;
  star: boolean;
  labelOn: boolean;
  labelId: string;
  forwardOn: boolean;
  forwardTo: string;
  delete: boolean;
  neverSpam: boolean;
  applyExisting: boolean;
}

function toForm(initial: FilterEditorProps["initial"], labels: readonly LabelChoice[]): FormState {
  const c = initial.criteria;
  const a = initial.actions ?? emptyActions();
  return {
    from: c.from.join(", "),
    to: c.to.join(", "),
    subject: c.subject,
    words: joinWords(c.words),
    notWords: joinWords(c.notWords),
    hasAttachment: c.hasAttachment,
    sizeOn: c.size !== null,
    sizeComparison: c.size?.comparison ?? "larger",
    sizeAmount: c.size ? String(c.size.amount) : "",
    sizeUnit: c.size?.unit ?? "M",
    archive: a.archive,
    markRead: a.markRead,
    star: a.star,
    labelOn: a.label !== null,
    labelId: a.label?.id ?? labels[0]?.id ?? "",
    forwardOn: a.forwardTo !== null,
    forwardTo: a.forwardTo ?? "",
    delete: a.delete,
    neverSpam: a.neverSpam,
    applyExisting: false,
  };
}

function toFilter(f: FormState, labels: readonly LabelChoice[]): MailFilter {
  const amount = Number(f.sizeAmount.trim());
  const label = f.labelOn ? labels.find((l) => l.id === f.labelId) : undefined;
  return normalizeFilter({
    criteria: {
      from: splitList(f.from),
      to: splitList(f.to),
      subject: f.subject,
      words: splitWords(f.words),
      notWords: splitWords(f.notWords),
      hasAttachment: f.hasAttachment,
      size: f.sizeOn && f.sizeAmount.trim() !== "" ? { comparison: f.sizeComparison, amount: Number.isFinite(amount) ? amount : NaN, unit: f.sizeUnit } : null,
    },
    actions: {
      archive: f.archive,
      markRead: f.markRead,
      star: f.star,
      label: f.labelOn ? { id: label?.id ?? "", name: label?.title ?? "" } : null,
      forwardTo: f.forwardOn ? f.forwardTo : null,
      delete: f.delete,
      neverSpam: f.neverSpam,
    },
  });
}

export function FilterEditor({ initial, isNew, labels, busy, onSave, onCancel }: FilterEditorProps) {
  const id = useId();
  const [form, setForm] = useState<FormState>(() => toForm(initial, labels));
  const [problems, setProblems] = useState<string[]>([]);
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setProblems([]);
  };

  const filter = useMemo(() => toFilter(form, labels), [form, labels]);
  const search = useMemo(() => criteriaToSearch(filter.criteria), [filter]);
  const retroactive = hasRetroactiveActions(filter.actions);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const found = filterProblems(filter);
    if (form.sizeOn && !/^\d+$/.test(form.sizeAmount.trim())) found.push("Size must be a whole number from 1 to 1,000,000.");
    if (form.forwardOn && form.forwardTo.trim() === "") found.push("Type the address to forward to.");
    if (found.length > 0) {
      setProblems([...new Set(found)]);
      return;
    }
    onSave(filter, form.applyExisting && retroactive);
  };

  const field = (key: "from" | "to" | "subject" | "words" | "notWords", label: string, hint?: string) => (
    <div className="settings-field filters-field">
      <label className="settings-label" htmlFor={`${id}-${key}`}>
        {label}
      </label>
      <input
        id={`${id}-${key}`}
        className="input"
        value={form[key]}
        autoComplete="off"
        spellCheck={false}
        aria-describedby={hint ? `${id}-${key}-hint` : undefined}
        onChange={(e) => set(key, e.target.value)}
      />
      {hint ? (
        <p id={`${id}-${key}-hint`} className="settings-hint filters-hint">
          {hint}
        </p>
      ) : null}
    </div>
  );

  return (
    <form className="filters-editor" aria-labelledby={`${id}-title`} onSubmit={submit} noValidate>
      <h3 id={`${id}-title`} className="filters-editor-title">
        {isNew ? "Create a filter" : "Edit filter"}
      </h3>

      <fieldset className="filters-group">
        <legend className="settings-label">Messages that match</legend>
        {field("from", "From", "Separate several senders with commas.")}
        {field("to", "To", "Matches To and Cc.")}
        {field("subject", "Subject")}
        {field("words", "Has the words", 'In the subject or the text. Put a phrase in "quotes".')}
        {field("notWords", "Doesn't have")}
        <div className="filters-size">
          <label className="settings-check">
            <input type="checkbox" checked={form.sizeOn} onChange={(e) => set("sizeOn", e.target.checked)} />
            Size
          </label>
          <select className="input" aria-label="Size comparison" value={form.sizeComparison} disabled={!form.sizeOn} onChange={(e) => set("sizeComparison", e.target.value as SizeCriterion["comparison"])}>
            <option value="larger">greater than</option>
            <option value="smaller">less than</option>
          </select>
          <input
            className="input filters-size-amount"
            aria-label="Size"
            inputMode="numeric"
            value={form.sizeAmount}
            disabled={!form.sizeOn}
            onChange={(e) => set("sizeAmount", e.target.value)}
          />
          <select className="input" aria-label="Size unit" value={form.sizeUnit} disabled={!form.sizeOn} onChange={(e) => set("sizeUnit", e.target.value as SizeCriterion["unit"])}>
            <option value="M">MB</option>
            <option value="K">KB</option>
            <option value="B">bytes</option>
          </select>
        </div>
        <label className="settings-check">
          <input type="checkbox" checked={form.hasAttachment} onChange={(e) => set("hasAttachment", e.target.checked)} />
          Has attachment
        </label>
      </fieldset>

      <fieldset className="filters-group">
        <legend className="settings-label">Do this</legend>
        <label className="settings-check">
          <input type="checkbox" checked={form.archive} onChange={(e) => set("archive", e.target.checked)} />
          Skip the Inbox (archive it)
        </label>
        <label className="settings-check">
          <input type="checkbox" checked={form.markRead} onChange={(e) => set("markRead", e.target.checked)} />
          Mark as read
        </label>
        <label className="settings-check">
          <input type="checkbox" checked={form.star} onChange={(e) => set("star", e.target.checked)} />
          Star it
        </label>
        <div className="filters-inline">
          <label className="settings-check">
            <input type="checkbox" checked={form.labelOn} disabled={labels.length === 0} onChange={(e) => set("labelOn", e.target.checked)} />
            Apply the label
          </label>
          <select className="input settings-select" aria-label="Label to apply" value={form.labelId} disabled={!form.labelOn} onChange={(e) => set("labelId", e.target.value)}>
            {labels.length === 0 ? <option value="">No labels yet</option> : null}
            {labels.map((l) => (
              <option key={l.id} value={l.id}>
                {l.title}
              </option>
            ))}
          </select>
        </div>
        <div className="filters-inline">
          <label className="settings-check">
            <input type="checkbox" checked={form.forwardOn} onChange={(e) => set("forwardOn", e.target.checked)} />
            Forward it to
          </label>
          <input
            className="input settings-select"
            type="email"
            aria-label="Forwarding address"
            autoComplete="off"
            value={form.forwardTo}
            disabled={!form.forwardOn}
            aria-invalid={form.forwardOn && form.forwardTo.trim() !== "" && !isAddress(form.forwardTo.trim()) ? true : undefined}
            onChange={(e) => set("forwardTo", e.target.value)}
          />
        </div>
        <label className="settings-check">
          <input type="checkbox" checked={form.delete} onChange={(e) => set("delete", e.target.checked)} />
          Delete it
        </label>
        <label className="settings-check">
          <input type="checkbox" checked={form.neverSpam} onChange={(e) => set("neverSpam", e.target.checked)} />
          Never send it to Spam
        </label>
      </fieldset>

      {retroactive ? (
        <div className="filters-apply">
          <label className="settings-check">
            <input type="checkbox" checked={form.applyExisting} onChange={(e) => set("applyExisting", e.target.checked)} />
            Also apply to matching conversations
          </label>
          {search ? (
            <p className="settings-hint filters-hint">
              The ones a search for <a href={formatRoute({ kind: "search", query: search })}>{search}</a> finds (not Spam or Trash). Forwarding and
              &ldquo;never send it to Spam&rdquo; only apply to new mail.
            </p>
          ) : null}
        </div>
      ) : null}

      {problems.length > 0 ? (
        <ul className="filters-problems" role="alert">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      ) : null}

      <div className="filters-buttons">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {isNew ? "Create filter" : "Save filter"}
        </button>
        <button type="button" className="btn btn-quiet" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
