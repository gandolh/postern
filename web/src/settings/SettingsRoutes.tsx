// The settings pages the shell renders for #settings/<section>: General,
// Accounts, Labels (the manager), Filters.
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

startDisplayPersistence();
startPrefs();

export interface SettingsRoutesProps {
  /** The section in the URL: general, accounts, labels, filters. Unknown sections show General. */
  section: string;
}

const SECTIONS: readonly [{ id: string; title: string }, ...{ id: string; title: string }[]] = [
  { id: "general", title: "General" },
  { id: "accounts", title: "Accounts" },
  { id: "labels", title: "Labels" },
  { id: "filters", title: "Filters" },
];

export function SettingsRoutes({ section }: SettingsRoutesProps) {
  const current = SECTIONS.find((s) => s.id === section) ?? SECTIONS[0];
  return (
    <section className="flex min-h-full flex-col" aria-labelledby="settings-title">
      <PrefsHost />
      <header className="sticky top-0 z-header flex min-h-[calc(var(--toolbar-height)+0.5rem)] flex-wrap items-center gap-x-3 gap-y-1 border-b border-border bg-surface px-6 py-2 max-sm:px-4">
        <h1 id="settings-title" className="text-xl font-semibold">
          Settings
        </h1>
      </header>
      <nav
        className="flex gap-1 overflow-x-auto border-b border-border px-6 [&_a]:border-b-[3px] [&_a]:border-transparent [&_a]:px-3 [&_a]:py-3 [&_a]:whitespace-nowrap [&_a]:text-text-muted [&_a]:no-underline [&_a]:hover:text-text [&_a]:focus-visible:[outline:var(--focus-ring)] [&_a]:focus-visible:outline-offset-(--focus-offset) [&_a[aria-current=page]]:border-accent [&_a[aria-current=page]]:font-semibold [&_a[aria-current=page]]:text-text"
        aria-label="Settings sections"
      >
        {SECTIONS.map((s) => (
          <a
            key={s.id}
            href={formatRoute({ kind: "settings", section: s.id })}
            aria-current={s.id === current.id ? "page" : undefined}
          >
            {s.title}
          </a>
        ))}
      </nav>
      {current.id === "general" ? (
        <GeneralSettings />
      ) : current.id === "accounts" ? (
        <AccountsSettings />
      ) : current.id === "labels" ? (
        <LabelManager />
      ) : (
        <FiltersSettings />
      )}
    </section>
  );
}
