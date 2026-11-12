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
import { Button } from "../components/ui/Button";
import { Input, inputClass } from "../components/ui/Input";

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
      size:
        f.sizeOn && f.sizeAmount.trim() !== ""
          ? { comparison: f.sizeComparison, amount: Number.isFinite(amount) ? amount : NaN, unit: f.sizeUnit }
          : null,
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
    if (form.sizeOn && !/^\d+$/.test(form.sizeAmount.trim()))
      found.push("Size must be a whole number from 1 to 1,000,000.");
    if (form.forwardOn && form.forwardTo.trim() === "") found.push("Type the address to forward to.");
    if (found.length > 0) {
      setProblems([...new Set(found)]);
      return;
    }
    onSave(filter, form.applyExisting && retroactive);
  };

  const field = (key: "from" | "to" | "subject" | "words" | "notWords", label: string, hint?: string) => (
    <div className="flex flex-col gap-1 [&_label]:font-medium">
      <label className="m-0 text-md font-semibold" htmlFor={`${id}-${key}`}>
        {label}
      </label>
      <Input
        id={`${id}-${key}`}
        value={form[key]}
        autoComplete="off"
        spellCheck={false}
        aria-describedby={hint ? `${id}-${key}-hint` : undefined}
        onChange={(e) => set(key, e.target.value)}
      />
      {hint ? (
        <p id={`${id}-${key}-hint`} className="m-0 text-sm text-text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );

  return (
    <form
      className="flex flex-col gap-4 rounded-lg border border-border bg-surface-raised p-4"
      aria-labelledby={`${id}-title`}
      onSubmit={submit}
      noValidate
    >
      <h3 id={`${id}-title`} className="m-0 text-md font-semibold">
        {isNew ? "Create a filter" : "Edit filter"}
      </h3>

      <fieldset className="m-0 flex flex-col gap-2 border-0 p-0 [&_legend]:mb-2 [&_legend]:p-0">
        <legend className="m-0 text-md font-semibold">Messages that match</legend>
        {field("from", "From", "Separate several senders with commas.")}
        {field("to", "To", "Matches To and Cc.")}
        {field("subject", "Subject")}
        {field("words", "Has the words", 'In the subject or the text. Put a phrase in "quotes".')}
        {field("notWords", "Doesn't have")}
        <div className="flex flex-wrap items-center gap-2 [&_select]:w-auto [&_select]:min-w-40">
          <label className="inline-flex min-h-8 cursor-pointer items-center gap-2 max-sm:min-h-11 [&_input]:m-0 [&_input]:size-4.5">
            <input type="checkbox" checked={form.sizeOn} onChange={(e) => set("sizeOn", e.target.checked)} />
            Size
          </label>
          <select
            className={inputClass()}
            aria-label="Size comparison"
            value={form.sizeComparison}
            disabled={!form.sizeOn}
            onChange={(e) => set("sizeComparison", e.target.value as SizeCriterion["comparison"])}
          >
            <option value="larger">greater than</option>
            <option value="smaller">less than</option>
          </select>
          <Input
            className="w-24"
            aria-label="Size"
            inputMode="numeric"
            value={form.sizeAmount}
            disabled={!form.sizeOn}
            onChange={(e) => set("sizeAmount", e.target.value)}
          />
          <select
            className={inputClass()}
            aria-label="Size unit"
            value={form.sizeUnit}
            disabled={!form.sizeOn}
            onChange={(e) => set("sizeUnit", e.target.value as SizeCriterion["unit"])}
          >
            <option value="M">MB</option>
            <option value="K">KB</option>
            <option value="B">bytes</option>
          </select>
        </div>
        <label className="inline-flex min-h-8 cursor-pointer items-center gap-2 max-sm:min-h-11 [&_input]:m-0 [&_input]:size-4.5">
          <input
            type="checkbox"
            checked={form.hasAttachment}
            onChange={(e) => set("hasAttachment", e.target.checked)}
          />
          Has attachment
        </label>
      </fieldset>

      <fieldset className="m-0 flex flex-col gap-2 border-0 p-0 [&_legend]:mb-2 [&_legend]:p-0">
        <legend className="m-0 text-md font-semibold">Do this</legend>
        <label className="inline-flex min-h-8 cursor-pointer items-center gap-2 max-sm:min-h-11 [&_input]:m-0 [&_input]:size-4.5">
          <input type="checkbox" checked={form.archive} onChange={(e) => set("archive", e.target.checked)} />
          Skip the Inbox (archive it)
        </label>
        <label className="inline-flex min-h-8 cursor-pointer items-center gap-2 max-sm:min-h-11 [&_input]:m-0 [&_input]:size-4.5">
          <input type="checkbox" checked={form.markRead} onChange={(e) => set("markRead", e.target.checked)} />
          Mark as read
        </label>
        <label className="inline-flex min-h-8 cursor-pointer items-center gap-2 max-sm:min-h-11 [&_input]:m-0 [&_input]:size-4.5">
          <input type="checkbox" checked={form.star} onChange={(e) => set("star", e.target.checked)} />
          Star it
        </label>
        <div className="flex flex-wrap items-center gap-2 [&_:is(select,input)]:w-auto [&_:is(select,input)]:min-w-40">
          <label className="inline-flex min-h-8 cursor-pointer items-center gap-2 max-sm:min-h-11 [&_input]:m-0 [&_input]:size-4.5">
            <input
              type="checkbox"
              checked={form.labelOn}
              disabled={labels.length === 0}
              onChange={(e) => set("labelOn", e.target.checked)}
            />
            Apply the label
          </label>
          <select
            className={inputClass("max-w-96")}
            aria-label="Label to apply"
            value={form.labelId}
            disabled={!form.labelOn}
            onChange={(e) => set("labelId", e.target.value)}
          >
            {labels.length === 0 ? <option value="">No labels yet</option> : null}
            {labels.map((l) => (
              <option key={l.id} value={l.id}>
                {l.title}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-2 [&_:is(select,input)]:w-auto [&_:is(select,input)]:min-w-40">
          <label className="inline-flex min-h-8 cursor-pointer items-center gap-2 max-sm:min-h-11 [&_input]:m-0 [&_input]:size-4.5">
            <input type="checkbox" checked={form.forwardOn} onChange={(e) => set("forwardOn", e.target.checked)} />
            Forward it to
          </label>
          <Input
            className="max-w-96"
            type="email"
            aria-label="Forwarding address"
            autoComplete="off"
            value={form.forwardTo}
            disabled={!form.forwardOn}
            aria-invalid={
              form.forwardOn && form.forwardTo.trim() !== "" && !isAddress(form.forwardTo.trim()) ? true : undefined
            }
            onChange={(e) => set("forwardTo", e.target.value)}
          />
        </div>
        <label className="inline-flex min-h-8 cursor-pointer items-center gap-2 max-sm:min-h-11 [&_input]:m-0 [&_input]:size-4.5">
          <input type="checkbox" checked={form.delete} onChange={(e) => set("delete", e.target.checked)} />
          Delete it
        </label>
        <label className="inline-flex min-h-8 cursor-pointer items-center gap-2 max-sm:min-h-11 [&_input]:m-0 [&_input]:size-4.5">
          <input type="checkbox" checked={form.neverSpam} onChange={(e) => set("neverSpam", e.target.checked)} />
          Never send it to Spam
        </label>
      </fieldset>

      {retroactive ? (
        <div className="flex flex-col gap-1">
          <label className="inline-flex min-h-8 cursor-pointer items-center gap-2 max-sm:min-h-11 [&_input]:m-0 [&_input]:size-4.5">
            <input
              type="checkbox"
              checked={form.applyExisting}
              onChange={(e) => set("applyExisting", e.target.checked)}
            />
            Also apply to matching conversations
          </label>
          {search ? (
            <p className="m-0 text-sm text-text-muted">
              The ones a search for <a href={formatRoute({ kind: "search", query: search })}>{search}</a> finds (not
              Spam or Trash). Forwarding and &ldquo;never send it to Spam&rdquo; only apply to new mail.
            </p>
          ) : null}
        </div>
      ) : null}

      {problems.length > 0 ? (
        <ul className="m-0 pl-5 text-danger" role="alert">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      ) : null}

      <div className="flex gap-2">
        <Button variant="primary" type="submit" disabled={busy}>
          {isNew ? "Create filter" : "Save filter"}
        </Button>
        <Button variant="quiet" type="button" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
