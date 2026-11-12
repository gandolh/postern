// The toolbar's Snooze button: Gmail's choices with their times,
// "Pick date and time", and Unsnooze when the selection is snoozed. The menu
// says once that snoozed mail comes back when Postern is open (the owner's
// call: it runs in the browser). A choice runs once focus is back on the
// button, so the date dialog returns focus there.

import { Clock } from "lucide-react";
import { useId, useMemo, useRef, useState } from "react";
import { Menu } from "../components/ui/Menu";
import { Modal } from "../components/ui/Modal";
import { IconButton } from "../shell/IconButton";
import { checkSnoozeTime, formatSnoozeTime, snoozePresets } from "./times";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";

export const SNOOZE_HELP = "Snoozed mail comes back when Postern is open.";

export interface SnoozeMenuProps {
  onSnooze: (at: Date) => void;
  /** Shown when something selected is snoozed. */
  onUnsnooze?: () => void;
  now?: () => Date;
}

export function SnoozeMenu({ onSnooze, onUnsnooze, now = () => new Date() }: SnoozeMenuProps) {
  const [open, setOpen] = useState(false);
  const [picking, setPicking] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const chosen = useRef<(() => void) | null>(null);
  // The times are worked out when the menu opens.
  const [openedAt, setOpenedAt] = useState(now);
  const presets = useMemo(() => snoozePresets(openedAt), [openedAt]);
  const helpId = useId();

  return (
    <div className="relative">
      <Menu.Root
        modal={false}
        open={open}
        onOpenChange={(next) => {
          if (next) setOpenedAt(now());
          setOpen(next);
        }}
      >
        <Menu.Trigger ref={button} render={<IconButton label="Snooze" icon={Clock} />} />
        <Menu.Popup
          positionerClassName="z-popup"
          className="flex min-w-48 flex-col rounded-lg border border-border bg-surface-raised py-2 shadow-md"
          aria-label="Snooze until"
          aria-describedby={helpId}
          finalFocus={() => {
            const choice = chosen.current;
            if (!choice) return true;
            chosen.current = null;
            button.current?.focus();
            choice();
            return false;
          }}
        >
          <p id={helpId} className="max-w-72 px-4 pt-1 pb-2 text-sm text-text-muted">
            Snooze until… {SNOOZE_HELP}
          </p>
          {presets.map((p) => (
            <Menu.Item
              key={p.id}
              className="flex min-h-9 w-full cursor-pointer items-center justify-between gap-4 px-4 text-start text-md text-text select-none focus-visible:[outline:var(--focus-ring)] focus-visible:-outline-offset-2 data-disabled:cursor-not-allowed data-disabled:text-text-subtle data-highlighted:bg-hover"
              onClick={() => {
                chosen.current = () => onSnooze(p.at);
              }}
            >
              <span>{p.label}</span>
              <span className="text-sm whitespace-nowrap text-text-muted">{formatSnoozeTime(p.at, openedAt)}</span>
            </Menu.Item>
          ))}
          <Menu.Item
            className="flex min-h-9 w-full cursor-pointer items-center justify-between gap-4 px-4 text-start text-md text-text select-none focus-visible:[outline:var(--focus-ring)] focus-visible:-outline-offset-2 data-disabled:cursor-not-allowed data-disabled:text-text-subtle data-highlighted:bg-hover"
            onClick={() => {
              chosen.current = () => setPicking(true);
            }}
          >
            Pick date and time
          </Menu.Item>
          {onUnsnooze ? (
            <>
              <Menu.Separator className="my-1 h-px bg-border" />
              <Menu.Item
                className="flex min-h-9 w-full cursor-pointer items-center justify-between gap-4 px-4 text-start text-md text-text select-none focus-visible:[outline:var(--focus-ring)] focus-visible:-outline-offset-2 data-disabled:cursor-not-allowed data-disabled:text-text-subtle data-highlighted:bg-hover"
                onClick={() => {
                  chosen.current = onUnsnooze;
                }}
              >
                Unsnooze
              </Menu.Item>
            </>
          ) : null}
        </Menu.Popup>
      </Menu.Root>
      {picking ? (
        <SnoozeDialog
          now={now}
          onSnooze={(at) => {
            setPicking(false);
            onSnooze(at);
          }}
          onCancel={() => setPicking(false)}
        />
      ) : null}
    </div>
  );
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function SnoozeDialog({
  onSnooze,
  onCancel,
  now = () => new Date(),
}: {
  onSnooze: (at: Date) => void;
  onCancel: () => void;
  now?: () => Date;
}) {
  const id = useId();
  const [opened] = useState(now);
  const tomorrow = new Date(opened.getFullYear(), opened.getMonth(), opened.getDate() + 1);
  const [date, setDate] = useState(
    `${tomorrow.getFullYear()}-${pad(tomorrow.getMonth() + 1)}-${pad(tomorrow.getDate())}`,
  );
  const [time, setTime] = useState("08:00");
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const [y, m, d] = date.split("-").map(Number);
    const [hh, mm] = time.split(":").map(Number);
    const at =
      y && m && d && hh !== undefined && mm !== undefined ? new Date(y, m - 1, d, hh, mm, 0, 0) : new Date(NaN);
    const problem = checkSnoozeTime(at, now());
    if (problem) setError(problem);
    else onSnooze(at);
  };

  return (
    <Modal
      className="w-[min(24rem,calc(100vw-2rem))] rounded-xl border border-border bg-surface-raised p-6 text-text"
      describedBy={`${id}-help`}
      disablePointerDismissal
      onClose={onCancel}
    >
      <Modal.Title className="text-xl">Snooze until</Modal.Title>
      <p id={`${id}-help`} className="mt-2 text-sm text-text-muted">
        {SNOOZE_HELP}
      </p>
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <div className="mt-4 flex flex-wrap gap-3">
          <label className="grid flex-[1_1_9rem] gap-1 text-sm text-text-muted">
            <span>Date</span>
            <Input
              type="date"
              data-autofocus
              value={date}
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
          <Button type="button" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="primary" type="submit">
            Snooze
          </Button>
        </div>
      </form>
    </Modal>
  );
}
