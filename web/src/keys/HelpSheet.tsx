// The keyboard-shortcut sheet (brief 14): a modal <dialog>, grouped as in
// Gmail, with a search box. The shell renders it once; useHelpSheet().open() shows it.

import { Fragment, useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { X } from "lucide-react";
import { getShortcutsEnabled, subscribeShortcutsEnabled } from "../prefs";
import { useHelpSheet } from "./helpSheet";
import { displayKeys, filterShortcuts } from "./shortcuts";
import "./keys.css";

function useShortcutsEnabled(): boolean {
  return useSyncExternalStore(subscribeShortcutsEnabled, getShortcutsEnabled, () => true);
}

export function HelpSheet() {
  const { isOpen, close } = useHelpSheet();
  const ref = useRef<HTMLDialogElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const enabled = useShortcutsEnabled();
  const searchId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (isOpen && !dialog.open) {
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
      searchRef.current?.focus();
    } else if (!isOpen && dialog.open) {
      if (typeof dialog.close === "function") dialog.close();
      else dialog.removeAttribute("open");
    }
  }, [isOpen]);

  const groups = filterShortcuts(query);

  return (
    <dialog ref={ref} className="keys-sheet" aria-labelledby="keys-sheet-title" onClose={() => {
        setQuery("");
        close();
      }}
    >
      <div className="keys-sheet-head">
        <h2 id="keys-sheet-title">Keyboard shortcuts</h2>
        <button type="button" className="icon-btn" aria-label="Close keyboard shortcuts" onClick={close}>
          <X aria-hidden="true" />
        </button>
      </div>
      <div className="keys-sheet-search">
        <label htmlFor={searchId} className="visually-hidden">
          Search shortcuts
        </label>
        <input
          ref={searchRef}
          id={searchId}
          type="text"
          className="input"
          placeholder="Search shortcuts"
          autoComplete="off"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      {enabled ? null : (
        <p className="keys-sheet-note">
          Keyboard shortcuts are off. Turn them on in <a href="#settings/general">Settings</a>.
        </p>
      )}
      <div className="keys-sheet-body" tabIndex={0} role="region" aria-label="Shortcut list">
        <p className="visually-hidden" role="status">
          {groups.length === 0 ? "No shortcuts match" : `${groups.reduce((n, g) => n + g.items.length, 0)} shortcuts`}
        </p>
        {groups.length === 0 ? <p className="keys-sheet-empty">No shortcut matches &ldquo;{query}&rdquo;.</p> : null}
        {groups.map(({ group, items }) => (
          <section key={group} className="keys-group" aria-labelledby={`keys-group-${group}`}>
            <h3 id={`keys-group-${group}`}>{group}</h3>
            <ul>
              {items.map((shortcut) => (
                <li key={shortcut.id}>
                  <span className="keys-desc">{shortcut.description}</span>
                  <span className="keys-keys">
                    {displayKeys(shortcut).map((alt, i) => (
                      <Fragment key={i}>
                        {i > 0 ? <span className="keys-or"> or </span> : null}
                        {alt.map((token, j) => (
                          <Fragment key={j}>
                            {j > 0 ? <span className="keys-then">{alt[0] === "Shift" || alt[0] === "Ctrl" ? "+" : "then"}</span> : null}
                            <kbd className="kbd">{token}</kbd>
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
    </dialog>
  );
}
