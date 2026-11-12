// The keyboard-shortcut sheet: a modal Base UI dialog (components/ui/Modal), grouped as in
// Gmail, with a search box. The shell renders it once; useHelpSheet().open() shows it.

import { Fragment, useId, useState, useSyncExternalStore } from "react";
import { X } from "lucide-react";
import { iconButtonClass } from "../shell/IconButton";
import { Modal } from "../components/ui/Modal";
import { getShortcutsEnabled, subscribeShortcutsEnabled } from "../prefs";
import { useHelpSheet } from "./helpSheet";
import { displayKeys, filterShortcuts } from "./shortcuts";
import { Input } from "../components/ui/Input";

function useShortcutsEnabled(): boolean {
  return useSyncExternalStore(subscribeShortcutsEnabled, getShortcutsEnabled, () => true);
}

export function HelpSheet() {
  const { isOpen, close } = useHelpSheet();
  const [query, setQuery] = useState("");
  const enabled = useShortcutsEnabled();
  const searchId = useId();

  // Every way out clears the search, so the sheet opens fresh next time.
  const dismiss = () => {
    setQuery("");
    close();
  };

  const groups = filterShortcuts(query);

  return (
    <Modal
      open={isOpen}
      className="flex max-h-[min(40rem,calc(100vh-2rem))] w-[min(32rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border border-border bg-surface-raised p-0 text-text shadow-lg"
      onClose={dismiss}
    >
      <div className="flex items-center justify-between gap-4 border-b border-border py-3 pr-3 pl-6 [&_h2]:text-xl">
        <Modal.Title>Keyboard shortcuts</Modal.Title>
        <button
          type="button"
          className={iconButtonClass(undefined, false)}
          aria-label="Close keyboard shortcuts"
          onClick={dismiss}
        >
          <X aria-hidden="true" />
        </button>
      </div>
      <div className="border-b border-border px-6 py-3 [&_:is(input,select)]:w-full">
        <label htmlFor={searchId} className="sr-only">
          Search shortcuts
        </label>
        <Input
          id={searchId}
          data-autofocus
          type="text"
          placeholder="Search shortcuts"
          autoComplete="off"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      {enabled ? null : (
        <p className="m-0 bg-warning-soft px-6 py-3 text-on-warning-soft [&_a]:text-inherit [&_a]:underline">
          Keyboard shortcuts are off. Turn them on in <a href="#settings/general">Settings</a>.
        </p>
      )}
      <div
        className="min-h-0 flex-1 overflow-y-auto px-6 pt-3 pb-6"
        tabIndex={0}
        role="region"
        aria-label="Shortcut list"
      >
        <p className="sr-only" role="status">
          {groups.length === 0 ? "No shortcuts match" : `${groups.reduce((n, g) => n + g.items.length, 0)} shortcuts`}
        </p>
        {groups.length === 0 ? <p className="text-text-muted">No shortcut matches &ldquo;{query}&rdquo;.</p> : null}
        {groups.map(({ group, items }) => (
          <section
            key={group}
            className="[&_h3]:mt-4 [&_h3]:mb-1 [&_h3]:text-md [&_h3]:font-semibold [&_li]:flex [&_li]:items-baseline [&_li]:justify-between [&_li]:gap-4 [&_li]:py-1 [&_ul]:m-0 [&_ul]:list-none [&_ul]:p-0"
            aria-labelledby={`keys-group-${group}`}
          >
            <h3 id={`keys-group-${group}`}>{group}</h3>
            <ul>
              {items.map((shortcut) => (
                <li key={shortcut.id}>
                  <span>{shortcut.description}</span>
                  <span className="inline-flex shrink-0 flex-wrap items-baseline justify-end gap-1">
                    {displayKeys(shortcut).map((alt, i) => (
                      <Fragment key={i}>
                        {i > 0 ? <span className="text-sm text-text-muted"> or </span> : null}
                        {alt.map((token, j) => (
                          <Fragment key={j}>
                            {j > 0 ? (
                              <span className="text-sm text-text-muted">
                                {alt[0] === "Shift" || alt[0] === "Ctrl" ? "+" : "then"}
                              </span>
                            ) : null}
                            <kbd className="inline-block min-w-[1.5em] rounded-sm border border-b-2 border-border bg-surface-sunken px-[0.45em] py-[0.1em] text-center font-mono text-sm leading-[1.3] text-text">
                              {token}
                            </kbd>
                          </Fragment>
                        ))}
                      </Fragment>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Modal>
  );
}
