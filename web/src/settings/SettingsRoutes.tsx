// The settings pages the shell renders for #settings/<section>: General,
// Accounts, Labels (brief 09's manager), Filters (brief 13).
// Settings apply as you change them; there is no Save button.
//
// Importing this module starts the per-device persistence of the display
// settings (the shell imports this file statically, so it runs at load).

import { FiltersSettings } from "../filters/FiltersSettings";
import { LabelManager } from "../labels/LabelManager";
import { PrefsHost, startDisplayPersistence, startPrefs } from "../prefs";
import { formatRoute } from "../shell/router";
import { AccountsSettings } from "./AccountsSettings";
import { GeneralSettings } from "./GeneralSettings";
import "./settings.css";

startDisplayPersistence();
startPrefs();

export interface SettingsRoutesProps {
  /** The section in the URL: general, accounts, labels, filters. Unknown sections show General. */
  section: string;
}

const SECTIONS: readonly { id: string; title: string }[] = [
  { id: "general", title: "General" },
  { id: "accounts", title: "Accounts" },
  { id: "labels", title: "Labels" },
  { id: "filters", title: "Filters" },
];

export function SettingsRoutes({ section }: SettingsRoutesProps) {
  const current = SECTIONS.find((s) => s.id === section) ?? SECTIONS[0]!;
  return (
    <section className="shell-page" aria-labelledby="settings-title">
      <PrefsHost />
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
      {current.id === "general" ? <GeneralSettings /> : current.id === "accounts" ? <AccountsSettings /> : current.id === "labels" ? <LabelManager /> : <FiltersSettings />}
    </section>
  );
}
