// "Swipe actions" for the settings page: what swiping a
// conversation left or right does on a touch screen. Per account, on this
// device (prefs). Gmail's default: both archive.

import { useId } from "react";
import { SWIPE_ACTIONS, usePrefs, type SwipeAction } from "../prefs";
import { inputClass } from "../components/ui/Input";

const TITLES: Record<SwipeAction, string> = {
  archive: "Archive",
  delete: "Delete",
  read: "Mark as read or unread",
  none: "Nothing",
};

function SwipeSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: SwipeAction;
  onChange: (value: SwipeAction) => void;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="m-0 text-md font-semibold">
        {label}
      </label>
      <select
        id={id}
        className={inputClass("max-w-96")}
        value={value}
        onChange={(e) => onChange(e.target.value as SwipeAction)}
      >
        {SWIPE_ACTIONS.map((action) => (
          <option key={action} value={action}>
            {TITLES[action]}
          </option>
        ))}
      </select>
    </div>
  );
}

export function SwipeSettings() {
  const { prefs, setPrefs } = usePrefs();
  const headingId = useId();
  return (
    <section className="flex flex-col gap-1" aria-labelledby={headingId}>
      <h2 id={headingId} className="m-0 text-md font-semibold">
        Swipe actions
      </h2>
      <p className="m-0 text-text-muted">On a touch screen, swipe a conversation in the list. Kept on this device.</p>
      <SwipeSelect label="Swipe right" value={prefs.swipeRight} onChange={(swipeRight) => setPrefs({ swipeRight })} />
      <SwipeSelect label="Swipe left" value={prefs.swipeLeft} onChange={(swipeLeft) => setPrefs({ swipeLeft })} />
    </section>
  );
}
