// "Schedule send" (brief 23), from the menu beside Send: Gmail's three
// choices with their times, and "Pick date and time". Times are this
// browser's time zone; Postern keeps no time zone of its own for the account.
// A modal dialog through shell/Modal, so it opens inside the composer window
// when that is full screen.

import { useId, useMemo, useState } from "react";
import { Modal } from "../shell/Modal";
import { checkSendTime, formatSendTime, schedulePresets } from "../send/schedule";

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
  if (!y || !m || !d || hh === undefined || mm === undefined || Number.isNaN(hh) || Number.isNaN(mm)) return new Date(NaN);
  return new Date(y, m - 1, d, hh, mm, 0, 0);
}

export function ScheduleDialog({ maxMs, onSchedule, onCancel, now = () => new Date() }: ScheduleDialogProps) {
  const id = useId();
  const [opened] = useState(now);
  const presets = useMemo(() => schedulePresets(opened), [opened]);
  const [picking, setPicking] = useState(false);
  /** Back from the picker: focus goes to the first choice again. */
  const [returned, setReturned] = useState(false);
  const tomorrow = presets[0]!.at;
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
      className="compose-question compose-schedule"
      labelledBy={`${id}-title`}
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
      <h2 id={`${id}-title`} className="compose-question-title">
        Schedule send
      </h2>
      {!picking ? (
        <>
          <ul className="compose-schedule-list">
            {presets.map((p, i) => (
              <li key={p.id}>
                <button
                  type="button"
                  className="compose-schedule-choice"
                  data-autofocus={i === 0 ? true : undefined}
                  autoFocus={i === 0 && returned}
                  onClick={() => onSchedule(p.at)}
                >
                  <span>{p.label}</span>
                  <span className="compose-schedule-time">{formatSendTime(p.at)}</span>
                </button>
              </li>
            ))}
            <li>
              <button type="button" className="compose-schedule-choice" onClick={() => setPicking(true)}>
                <span>Pick date and time</span>
              </button>
            </li>
          </ul>
          <div className="compose-question-actions">
            <button type="button" className="btn" onClick={onCancel}>
              Cancel
            </button>
          </div>
        </>
      ) : (
        <form
          className="compose-schedule-pick"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            submitPicked();
          }}
        >
          <div className="compose-schedule-fields">
            <label className="compose-schedule-field">
              <span>Date</span>
              <input
                type="date"
                className="input"
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
            <label className="compose-schedule-field">
              <span>Time</span>
              <input
                type="time"
                className="input"
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
            <p id={`${id}-error`} className="compose-schedule-error" role="alert">
              {error}
            </p>
          ) : null}
          <div className="compose-question-actions">
            <button
              type="button"
              className="btn"
              onClick={() => {
                setPicking(false);
                setReturned(true);
              }}
            >
              Back
            </button>
            <button type="submit" className="btn btn-primary">
              Schedule send
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
