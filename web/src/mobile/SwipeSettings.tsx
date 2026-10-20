// "Swipe actions" for the settings page (brief 16): what swiping a
// conversation left or right does on a touch screen. Per account, on this
// device (prefs). Gmail's default: both archive.

import { useId } from "react";
import { SWIPE_ACTIONS, usePrefs, type SwipeAction } from "../prefs";

const TITLES: Record<SwipeAction, string> = {
  archive: "Archive",
  delete: "Delete",
  read: "Mark as read or unread",
  none: "Nothing",
};

function SwipeSelect({ label, value, onChange }: { label: string; value: SwipeAction; onChange: (value: SwipeAction) => void }) {
  const id = useId();
  return (
    <div className="settings-field">
      <label htmlFor={id} className="settings-label">
        {label}
      </label>
      <select id={id} className="input settings-select" value={value} onChange={(e) => onChange(e.target.value as SwipeAction)}>
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
    <section className="settings-field" aria-labelledby={headingId}>
      <h2 id={headingId} className="settings-label">
        Swipe actions
      </h2>
      <p className="settings-hint">On a touch screen, swipe a conversation in the list. Kept on this device.</p>
      <SwipeSelect label="Swipe right" value={prefs.swipeRight} onChange={(swipeRight) => setPrefs({ swipeRight })} />
      <SwipeSelect label="Swipe left" value={prefs.swipeLeft} onChange={(swipeLeft) => setPrefs({ swipeLeft })} />
    </section>
  );
}
