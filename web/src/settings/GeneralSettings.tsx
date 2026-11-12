// General: the per-device display settings and prefs, desktop notifications,
// allowed image senders, and the vacation responder (server-side).

import { useId } from "react";
import { useAccount } from "../auth";
import { useDesktopNotifications } from "../notify";
import { UNDO_SEND_SECONDS, usePrefs, type ImagesPreference, type UndoSendSeconds } from "../prefs";
import { SwipeSettings } from "../mobile/SwipeSettings";
import { WebPushToggle } from "../push/WebPushToggle";
import { forgetImagesFrom, imageAllowanceList, useImageAllowance } from "../render/allowance";
import {
  DENSITIES,
  READING_PANES,
  THEMES,
  useTheme,
  type Density,
  type ReadingPane,
  type ThemePreference,
} from "../theme";
import { RadioGroup } from "../components/ui/RadioGroup";
import { Switch } from "../components/ui/Switch";
import { VacationForm } from "./VacationForm";

const THEME_TITLES: Record<ThemePreference, string> = { system: "Same as the device", light: "Light", dark: "Dark" };
const DENSITY_TITLES: Record<Density, string> = { default: "Default", comfortable: "Comfortable", compact: "Compact" };
const PANE_TITLES: Record<ReadingPane, string> = { none: "No split", right: "Right of inbox", below: "Below inbox" };
const IMAGE_TITLES: Record<ImagesPreference, string> = {
  ask: "Ask before displaying external images",
  always: "Always display external images",
};

export function GeneralSettings() {
  const { theme, density, readingPane, setTheme, setDensity, setReadingPane } = useTheme();
  const { prefs, setPrefs } = usePrefs();
  return (
    <div className="settings-form">
      <p className="settings-hint">Display settings are kept in this browser. A new device starts from the defaults.</p>
      <Choice legend="Theme" name="theme" options={THEMES} titles={THEME_TITLES} value={theme} onChange={setTheme} />
      <Choice
        legend="Density"
        name="density"
        options={DENSITIES}
        titles={DENSITY_TITLES}
        value={density}
        onChange={setDensity}
      />
      <Choice
        legend="Reading pane"
        name="reading-pane"
        options={READING_PANES}
        titles={PANE_TITLES}
        value={readingPane}
        onChange={setReadingPane}
      />
      <Switch checked={prefs.conversationView} onCheckedChange={(on) => setPrefs({ conversationView: on })}>
        Conversation view: group replies into one row
      </Switch>
      <UndoSendChoice value={prefs.undoSendSeconds} onChange={(undoSendSeconds) => setPrefs({ undoSendSeconds })} />
      <Choice
        legend="Images"
        name="images"
        options={["ask", "always"] as const}
        titles={IMAGE_TITLES}
        value={prefs.images}
        onChange={(images) => setPrefs({ images })}
      />
      <ImageSenders />
      <Switch checked={prefs.shortcuts} onCheckedChange={(on) => setPrefs({ shortcuts: on })}>
        Keyboard shortcuts on
      </Switch>
      <NotificationsToggle />
      <WebPushToggle />
      <SwipeSettings />
      <VacationForm />
    </div>
  );
}

function UndoSendChoice({ value, onChange }: { value: UndoSendSeconds; onChange: (seconds: UndoSendSeconds) => void }) {
  const id = useId();
  return (
    <div className="settings-field">
      <label htmlFor={id} className="settings-label">
        Undo send: cancellation period
      </label>
      <select
        id={id}
        className="input settings-select"
        value={value}
        onChange={(e) => onChange(Number(e.target.value) as UndoSendSeconds)}
      >
        {UNDO_SEND_SECONDS.map((s) => (
          <option key={s} value={s}>
            {s} seconds
          </option>
        ))}
      </select>
    </div>
  );
}

function NotificationsToggle() {
  const { enabled, permission, setEnabled } = useDesktopNotifications();
  if (permission === "unsupported") return null;
  const denied = permission === "denied";
  return (
    <div className="settings-field">
      <Switch
        checked={enabled}
        disabled={denied}
        aria-describedby={denied ? "settings-notify-denied" : undefined}
        onCheckedChange={(on) => void setEnabled(on)}
      >
        Desktop notifications for new mail
      </Switch>
      {denied ? (
        <p id="settings-notify-denied" className="settings-hint">
          Blocked in your browser&rsquo;s site settings.
        </p>
      ) : null}
    </div>
  );
}

function ImageSenders() {
  const { username } = useAccount();
  useImageAllowance(username); // re-renders when the list changes, here or in another tab
  const senders = imageAllowanceList(username);
  const headingId = useId();
  return (
    <section className="settings-field" aria-labelledby={headingId}>
      <h2 id={headingId} className="settings-label">
        Senders whose images are always displayed
      </h2>
      {senders.length === 0 ? (
        <p className="settings-hint">
          None. Use &ldquo;Always display images from&rdquo; on a message to add a sender.
        </p>
      ) : (
        <ul className="settings-list">
          {senders.map((sender) => (
            <li key={sender}>
              <span>{sender}</span>
              <button
                type="button"
                className="btn btn-quiet"
                aria-label={`Remove ${sender}`}
                onClick={() => forgetImagesFrom(username, sender)}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

interface ChoiceProps<T extends string> {
  legend: string;
  name: string;
  options: readonly T[];
  titles: Record<T, string>;
  value: T;
  onChange: (value: T) => void;
}

export function Choice<T extends string>({ legend, name, options, titles, value, onChange }: ChoiceProps<T>) {
  return (
    <RadioGroup
      className="settings-choice"
      legend={legend}
      name={name}
      options={options.map((option) => ({ value: option, label: titles[option] }))}
      value={value}
      onValueChange={onChange}
    />
  );
}
