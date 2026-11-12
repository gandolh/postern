// The advanced-search form under the search box (Gmail's "Show search
// options"): fields in, an operator string out. It writes the string back to
// the box (formatSearch) and searches; it does not run anything itself.

import { formatSearch, type AdvancedSearchFields } from "@postern/jmap";
import { useId, useState, type FormEvent } from "react";
import { useLabels } from "../labels/useLabels";
import { Button } from "../components/ui/Button";
import { Input, inputClass } from "../components/ui/Input";

export interface AdvancedSearchProps {
  /** Called with the operator string when the person presses Search. */
  onSearch: (query: string) => void;
  onClose: () => void;
}

const DAY_OPTIONS: { label: string; days: number }[] = [
  { label: "1 day", days: 1 },
  { label: "3 days", days: 3 },
  { label: "1 week", days: 7 },
  { label: "2 weeks", days: 14 },
  { label: "1 month", days: 30 },
  { label: "2 months", days: 60 },
  { label: "6 months", days: 183 },
  { label: "1 year", days: 365 },
];

const PLACES: { label: string; value: string }[] = [
  { label: "All Mail", value: "" },
  { label: "Mail, Spam and Trash", value: "anywhere" },
  { label: "Inbox", value: "inbox" },
  { label: "Starred", value: "starred" },
  { label: "Sent", value: "sent" },
  { label: "Drafts", value: "drafts" },
  { label: "Spam", value: "spam" },
  { label: "Trash", value: "trash" },
];

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function AdvancedSearch({ onSearch, onClose }: AdvancedSearchProps) {
  const id = useId();
  const { labels } = useLabels();
  const userLabels = labels.filter((l) => !l.system);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [words, setWords] = useState("");
  const [notWords, setNotWords] = useState("");
  const [comparison, setComparison] = useState<"larger" | "smaller">("larger");
  const [amount, setAmount] = useState("");
  const [unit, setUnit] = useState<"B" | "K" | "M">("M");
  const [days, setDays] = useState(1);
  const [date, setDate] = useState("");
  const [place, setPlace] = useState("");
  const [hasAttachment, setHasAttachment] = useState(false);

  function fields(): AdvancedSearchFields {
    const size = Number(amount);
    return {
      from,
      to,
      subject,
      words,
      notWords,
      label: place,
      hasAttachment,
      size: amount.trim() !== "" && size > 0 ? { comparison, amount: size, unit } : undefined,
      dateWithin: date ? { days, date } : undefined,
    };
  }

  function submit(event: FormEvent): void {
    event.preventDefault();
    const q = formatSearch(fields());
    if (q) onSearch(q);
    else onClose();
  }

  const field = (name: string) => `${id}-${name}`;

  return (
    <form className="search-advanced-form" onSubmit={submit}>
      <div className="grid grid-cols-[minmax(6.5rem,max-content)_1fr] items-center gap-x-3 gap-y-2 text-md [&_:is(input:not([type=checkbox]),select)]:min-h-9 [&_:is(input:not([type=checkbox]),select)]:min-w-0 [&_:is(input:not([type=checkbox]),select)]:text-md">
        <label htmlFor={field("from")}>From</label>
        <Input id={field("from")} value={from} onChange={(e) => setFrom(e.target.value)} autoFocus />
        <label htmlFor={field("to")}>To</label>
        <Input id={field("to")} value={to} onChange={(e) => setTo(e.target.value)} />
        <label htmlFor={field("subject")}>Subject</label>
        <Input id={field("subject")} value={subject} onChange={(e) => setSubject(e.target.value)} />
        <label htmlFor={field("words")}>Has the words</label>
        <Input id={field("words")} value={words} onChange={(e) => setWords(e.target.value)} />
        <label htmlFor={field("not")}>Doesn’t have</label>
        <Input id={field("not")} value={notWords} onChange={(e) => setNotWords(e.target.value)} />
        <label htmlFor={field("size")}>Size</label>
        <div className="flex min-w-0 gap-2 [&>:is(input,select)]:flex-[1_1_auto]">
          <select
            aria-label="Larger or smaller"
            className={inputClass()}
            value={comparison}
            onChange={(e) => setComparison(e.target.value as "larger" | "smaller")}
          >
            <option value="larger">greater than</option>
            <option value="smaller">less than</option>
          </select>
          <Input
            id={field("size")}
            className="flex-[0_1_6rem]!"
            type="number"
            min="0"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <select
            aria-label="Size unit"
            className={inputClass()}
            value={unit}
            onChange={(e) => setUnit(e.target.value as "B" | "K" | "M")}
          >
            <option value="M">MB</option>
            <option value="K">KB</option>
            <option value="B">Bytes</option>
          </select>
        </div>
        <label htmlFor={field("days")}>Date within</label>
        <div className="flex min-w-0 gap-2 [&>:is(input,select)]:flex-[1_1_auto]">
          <select
            id={field("days")}
            className={inputClass()}
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
          >
            {DAY_OPTIONS.map((o) => (
              <option key={o.days} value={o.days}>
                {o.label}
              </option>
            ))}
          </select>
          <Input
            aria-label="Of this date"
            type="date"
            value={date}
            placeholder={today()}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <label htmlFor={field("place")}>Search</label>
        <select id={field("place")} className={inputClass()} value={place} onChange={(e) => setPlace(e.target.value)}>
          {PLACES.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
          {userLabels.length > 0 && (
            <optgroup label="Labels">
              {userLabels.map((l) => (
                <option key={l.id} value={l.path}>
                  {l.path}
                </option>
              ))}
            </optgroup>
          )}
        </select>
        <span aria-hidden="true" />
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={hasAttachment} onChange={(e) => setHasAttachment(e.target.checked)} />
          Has attachment
        </label>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="quiet" type="button" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="primary" type="submit">
          Search
        </Button>
      </div>
    </form>
  );
}
