// "Schedule send", from the menu beside Send: Gmail's three
// choices with their times, and "Pick date and time". Times are this
// browser's time zone; Postern keeps no time zone of its own for the account.
// A modal dialog through components/ui/Modal, so it opens inside the composer window
// when that is full screen.

import { useId, useMemo, useState } from "react";
import { Modal } from "../components/ui/Modal";
import { checkSendTime, formatSendTime, schedulePresets } from "../send/schedule";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";

export interface ScheduleDialogProps {
  /** How far ahead the server lets a message wait, in ms. */
  maxMs: number;
  onSchedule: (at: Date) => void;
  onCancel: () => void;
  /** For tests. */
  now?: () => Date;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** A date input's value (local), YYYY-MM-DD. */
function dateValue(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** The local time the two inputs name. */
function picked(date: string, time: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  if (!y || !m || !d || hh === undefined || mm === undefined || Number.isNaN(hh) || Number.isNaN(mm))
    return new Date(NaN);
  return new Date(y, m - 1, d, hh, mm, 0, 0);
}

export function ScheduleDialog({ maxMs, onSchedule, onCancel, now = () => new Date() }: ScheduleDialogProps) {
  const id = useId();
  const [opened] = useState(now);
  const presets = useMemo(() => schedulePresets(opened), [opened]);
  const [picking, setPicking] = useState(false);
  /** Back from the picker: focus goes to the first choice again. */
  const [returned, setReturned] = useState(false);
  const tomorrow = presets[0]?.at ?? opened;
  const [date, setDate] = useState(dateValue(tomorrow));
  const [time, setTime] = useState("08:00");
  const [error, setError] = useState<string | null>(null);

  const submitPicked = () => {
    const at = picked(date, time);
    const problem = checkSendTime(at, now(), maxMs);
    if (problem) {
      setError(problem);
      return;
    }
    onSchedule(at);
  };

  return (
    <Modal
      className="w-[min(24rem,calc(100vw-2rem))] max-w-[min(28rem,calc(100vw-2rem))] rounded-xl border border-border bg-surface-raised p-6 text-text shadow-lg"
      disablePointerDismissal
      onClose={onCancel}
      onKeyDown={(event) => {
        // Escape is this dialog's, not the composer window's around it.
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          onCancel();
        }
      }}
    >
      <Modal.Title className="text-xl">Schedule send</Modal.Title>
      {!picking ? (
        <>
          <ul className="-mx-2 mt-4 grid list-none gap-1 p-0">
            {presets.map((p, i) => (
              <li key={p.id}>
                <button
                  type="button"
                  className="flex w-full cursor-pointer items-baseline justify-between gap-3 rounded-md bg-transparent p-2 text-left text-text hover:bg-hover focus-visible:bg-hover"
                  data-autofocus={i === 0 ? true : undefined}
                  autoFocus={i === 0 && returned}
                  onClick={() => onSchedule(p.at)}
                >
                  <span>{p.label}</span>
                  <span className="text-sm whitespace-nowrap text-text-muted">{formatSendTime(p.at)}</span>
                </button>
              </li>
            ))}
            <li>
              <button
                type="button"
                className="flex w-full cursor-pointer items-baseline justify-between gap-3 rounded-md bg-transparent p-2 text-left text-text hover:bg-hover focus-visible:bg-hover"
                onClick={() => setPicking(true)}
              >
                <span>Pick date and time</span>
              </button>
            </li>
          </ul>
          <div className="mt-6 flex justify-end gap-2">
            <Button type="button" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        </>
      ) : (
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            submitPicked();
          }}
        >
          <div className="mt-4 flex flex-wrap gap-3">
            <label className="grid flex-[1_1_9rem] gap-1 text-sm text-text-muted">
              <span>Date</span>
              <Input
                type="date"
                autoFocus
                value={date}
                min={dateValue(opened)}
                aria-describedby={error ? `${id}-error` : undefined}
                onChange={(e) => {
                  setDate(e.target.value);
                  setError(null);
                }}
              />
            </label>
            <label className="grid flex-[1_1_9rem] gap-1 text-sm text-text-muted">
              <span>Time</span>
              <Input
                type="time"
                value={time}
                aria-describedby={error ? `${id}-error` : undefined}
                onChange={(e) => {
                  setTime(e.target.value);
                  setError(null);
                }}
              />
            </label>
          </div>
          {error ? (
            <p id={`${id}-error`} className="mt-3 text-sm text-danger" role="alert">
              {error}
            </p>
          ) : null}
          <div className="mt-6 flex justify-end gap-2">
            <Button
              type="button"
              onClick={() => {
                setPicking(false);
                setReturned(true);
              }}
            >
              Back
            </Button>
            <Button variant="primary" type="submit">
              Schedule send
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
