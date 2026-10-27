// The toolbar's Snooze button (brief 24): Gmail's choices with their times,
// "Pick date and time", and Unsnooze when the selection is snoozed. The menu
// says once that snoozed mail comes back when Postern is open (the owner's
// call: it runs in the browser). A choice runs once focus is back on the
// button, so the date dialog returns focus there.

import { Menu } from "@base-ui/react/menu";
import { Clock } from "lucide-react";
import { useId, useMemo, useRef, useState } from "react";
import { Modal } from "../shell/Modal";
import { IconButton } from "../shell/IconButton";
import { checkSnoozeTime, formatSnoozeTime, snoozePresets } from "./times";
import "./snooze.css";

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
    <div className="list-menu">
      <Menu.Root
        modal={false}
        open={open}
        onOpenChange={(next) => {
          if (next) setOpenedAt(now());
          setOpen(next);
        }}
      >
        <Menu.Trigger ref={button} render={<IconButton label="Snooze" icon={Clock} />} />
        <Menu.Portal>
          <Menu.Positioner className="list-menu-positioner" side="bottom" align="start" sideOffset={4} collisionPadding={8}>
            <Menu.Popup
              className="list-menu-popup snooze-menu"
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
              <p id={helpId} className="snooze-help">
                Snooze until… {SNOOZE_HELP}
              </p>
              {presets.map((p) => (
                <Menu.Item
                  key={p.id}
                  className="list-menu-item snooze-item"
                  onClick={() => {
                    chosen.current = () => onSnooze(p.at);
                  }}
                >
                  <span>{p.label}</span>
                  <span className="snooze-item-time">{formatSnoozeTime(p.at, openedAt)}</span>
                </Menu.Item>
              ))}
              <Menu.Item
                className="list-menu-item snooze-item"
                onClick={() => {
                  chosen.current = () => setPicking(true);
                }}
              >
                Pick date and time
              </Menu.Item>
              {onUnsnooze ? (
                <>
                  <Menu.Separator className="snooze-separator" />
                  <Menu.Item
                    className="list-menu-item snooze-item"
                    onClick={() => {
                      chosen.current = onUnsnooze;
                    }}
                  >
                    Unsnooze
                  </Menu.Item>
                </>
              ) : null}
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
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

export function SnoozeDialog({ onSnooze, onCancel, now = () => new Date() }: { onSnooze: (at: Date) => void; onCancel: () => void; now?: () => Date }) {
  const id = useId();
  const [opened] = useState(now);
  const tomorrow = new Date(opened.getFullYear(), opened.getMonth(), opened.getDate() + 1);
  const [date, setDate] = useState(`${tomorrow.getFullYear()}-${pad(tomorrow.getMonth() + 1)}-${pad(tomorrow.getDate())}`);
  const [time, setTime] = useState("08:00");
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const [y, m, d] = date.split("-").map(Number);
    const [hh, mm] = time.split(":").map(Number);
    const at = y && m && d && hh !== undefined && mm !== undefined ? new Date(y, m - 1, d, hh, mm, 0, 0) : new Date(NaN);
    const problem = checkSnoozeTime(at, now());
    if (problem) setError(problem);
    else onSnooze(at);
  };

  return (
    <Modal className="snooze-dialog" labelledBy={`${id}-title`} describedBy={`${id}-help`} onClose={onCancel}>
      <h2 id={`${id}-title`} className="snooze-dialog-title">
        Snooze until
      </h2>
      <p id={`${id}-help`} className="snooze-dialog-help">
        {SNOOZE_HELP}
      </p>
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <div className="snooze-fields">
          <label className="snooze-field">
            <span>Date</span>
            <input
              type="date"
              className="input"
              data-autofocus
              value={date}
              aria-describedby={error ? `${id}-error` : undefined}
              onChange={(e) => {
                setDate(e.target.value);
                setError(null);
              }}
            />
          </label>
          <label className="snooze-field">
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
          <p id={`${id}-error`} className="snooze-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="snooze-actions">
          <button type="button" className="btn" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary">
            Snooze
          </button>
        </div>
      </form>
    </Modal>
  );
}
