// Brief 12 replaces this stub with the settings pages. The shell renders it
// for #settings/<section>.
//
// For now General carries the three display settings, applied at once
// through the theme module's setters (brief 12 keeps them and persists them
// per device).

import { useId } from "react";
import { LabelManager } from "../labels/LabelManager";
import { formatRoute } from "../shell/router";
import "./settings.css";
import { DENSITIES, READING_PANES, THEMES, useTheme, type Density, type ReadingPane, type ThemePreference } from "../theme";

export interface SettingsRoutesProps {
  /** The section in the URL: general, accounts, labels, filters (brief 13). Unknown sections are brief 12's to handle. */
  section: string;
}

const SECTIONS: readonly { id: string; title: string }[] = [
  { id: "general", title: "General" },
  { id: "accounts", title: "Accounts" },
  { id: "labels", title: "Labels" },
  { id: "filters", title: "Filters" },
];

const THEME_TITLES: Record<ThemePreference, string> = { system: "Same as the device", light: "Light", dark: "Dark" };
const DENSITY_TITLES: Record<Density, string> = { default: "Default", comfortable: "Comfortable", compact: "Compact" };
const PANE_TITLES: Record<ReadingPane, string> = { none: "No split", right: "Right of inbox", below: "Below inbox" };

export function SettingsRoutes({ section }: SettingsRoutesProps) {
  const current = SECTIONS.find((s) => s.id === section) ?? SECTIONS[0]!;
  return (
    <section className="shell-page" aria-labelledby="settings-title">
      <header className="shell-page-header">
        <h1 id="settings-title" className="shell-page-title">
          Settings
        </h1>
      </header>
      <nav className="settings-tabs" aria-label="Settings sections">
        {SECTIONS.map((s) => (
          <a key={s.id} href={formatRoute({ kind: "settings", section: s.id })} aria-current={s.id === current.id ? "page" : undefined}>
            {s.title}
          </a>
        ))}
      </nav>
      {current.id === "general" ? (
        <DisplaySettingsForm />
      ) : current.id === "labels" ? (
        <LabelManager />
      ) : (
        <p className="shell-page-body">{current.title} settings appear here.</p>
      )}
    </section>
  );
}

function DisplaySettingsForm() {
  const { theme, density, readingPane, setTheme, setDensity, setReadingPane } = useTheme();
  return (
    <div className="settings-form">
      <Choice legend="Theme" name="theme" options={THEMES} titles={THEME_TITLES} value={theme} onChange={setTheme} />
      <Choice legend="Density" name="density" options={DENSITIES} titles={DENSITY_TITLES} value={density} onChange={setDensity} />
      <Choice legend="Reading pane" name="reading-pane" options={READING_PANES} titles={PANE_TITLES} value={readingPane} onChange={setReadingPane} />
    </div>
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

function Choice<T extends string>({ legend, name, options, titles, value, onChange }: ChoiceProps<T>) {
  const id = useId();
  return (
    <fieldset className="settings-choice">
      <legend>{legend}</legend>
      {options.map((option) => (
        <label key={option} htmlFor={`${id}-${option}`}>
          <input id={`${id}-${option}`} type="radio" name={name} value={option} checked={value === option} onChange={() => onChange(option)} />
          {titles[option]}
        </label>
      ))}
    </fieldset>
  );
}
