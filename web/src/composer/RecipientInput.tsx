// A To, Cc or Bcc field: addresses as chips, typed or pasted (a whole list at
// once), checked as they are added (an invalid one stays, marked, until it is
// fixed or removed), with suggestions from ./recipients.ts.

import { formatAddress } from "@postern/jmap";
import { X } from "lucide-react";
import { forwardRef, useEffect, useId, useImperativeHandle, useRef, useState, type ClipboardEvent, type KeyboardEvent, type ReactNode } from "react";
import type { RecipientSuggestion, RecipientSource } from "./recipients";
import type { ComposeSession, Recipient, RecipientField } from "./session";

export interface RecipientInputProps {
  session: ComposeSession;
  source: RecipientSource;
  field: RecipientField;
  label: string;
  recipients: readonly Recipient[];
  /** Extra controls at the end of the row (the Cc / Bcc buttons). */
  trailing?: ReactNode;
}

export interface RecipientInputHandle {
  focus(): void;
}

const SEPARATOR = /[,;\n]/;

function chipText(r: Recipient): string {
  if (!r.valid) return r.raw || r.email;
  return r.name?.trim() || r.email;
}

export const RecipientInput = forwardRef<RecipientInputHandle, RecipientInputProps>(function RecipientInput({ session, source, field, label, recipients, trailing }, ref) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [suggestions, setSuggestions] = useState<RecipientSuggestion[]>([]);
  const [active, setActive] = useState(-1);
  const id = useId();
  const listId = `${id}-suggestions`;

  useImperativeHandle(ref, () => ({ focus: () => inputRef.current?.focus() }), []);

  // Suggestions for what is being typed (debounced; stale answers dropped).
  const query = text.trim();
  useEffect(() => {
    if (!query || SEPARATOR.test(query)) return;
    const ac = new AbortController();
    const timer = setTimeout(() => {
      source
        .suggest(query, 8, ac.signal)
        .then((people) => {
          if (ac.signal.aborted) return;
          const taken = new Set(recipients.map((r) => r.email.toLowerCase()));
          setSuggestions(people.filter((p) => !taken.has(p.email.toLowerCase())));
          setActive(-1);
        })
        .catch(() => {});
    }, 120);
    return () => {
      ac.abort();
      clearTimeout(timer);
    };
  }, [query, source, recipients]);

  const open = query !== "" && suggestions.length > 0;

  function commit(value: string): void {
    if (value.trim()) session.addRecipientText(field, value);
    setText("");
    setSuggestions([]);
    setActive(-1);
  }

  function choose(p: RecipientSuggestion): void {
    commit(formatAddress(p));
    inputRef.current?.focus();
  }

  function remove(r: Recipient): void {
    session.setRecipients(
      field,
      recipients.filter((x) => x.key !== r.key),
    );
    inputRef.current?.focus();
  }

  /** Take a chip back into the text box to fix it. */
  function edit(r: Recipient): void {
    session.setRecipients(
      field,
      recipients.filter((x) => x.key !== r.key),
    );
    setText(r.valid ? formatAddress(r) : r.raw);
    inputRef.current?.focus();
  }

  function onChange(value: string): void {
    if (SEPARATOR.test(value)) {
      // Everything up to the last separator becomes chips; the rest stays typed.
      const cut = Math.max(value.lastIndexOf(","), value.lastIndexOf(";"), value.lastIndexOf("\n"));
      const done = value.slice(0, cut);
      const rest = value.slice(cut + 1);
      if (/^\s*"[^"]*$/.test(done.split(/[,;\n]/).pop() ?? "")) {
        // A comma inside a quoted name ("Smith, Jo"): keep typing.
        setText(value);
        return;
      }
      commit(done);
      setText(rest.trimStart());
      return;
    }
    setText(value);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === "ArrowDown" && open) {
      event.preventDefault();
      setActive((a) => (a + 1) % suggestions.length);
    } else if (event.key === "ArrowUp" && open) {
      event.preventDefault();
      setActive((a) => (a <= 0 ? suggestions.length - 1 : a - 1));
    } else if (event.key === "Enter" || (event.key === "Tab" && !event.shiftKey && text.trim())) {
      if (event.ctrlKey || event.metaKey) {
        // Ctrl+Enter sends: take what is typed first.
        commit(text);
        return;
      }
      const pick = open && active >= 0 ? suggestions[active] : undefined;
      if (pick) {
        event.preventDefault();
        choose(pick);
      } else if (text.trim()) {
        if (event.key === "Enter") event.preventDefault();
        commit(text);
      }
    } else if (event.key === "Escape" && (open || text)) {
      event.stopPropagation();
      if (open) setSuggestions([]);
      else setText("");
    } else if (event.key === "Backspace" && text === "" && recipients.length > 0) {
      event.preventDefault();
      edit(recipients[recipients.length - 1] as Recipient);
    }
  }

  function onPaste(event: ClipboardEvent<HTMLInputElement>): void {
    const pasted = event.clipboardData.getData("text/plain");
    if (!SEPARATOR.test(pasted) && !/\s<|@.*@/.test(pasted)) return;
    event.preventDefault();
    commit(`${text}${pasted}`);
  }

  const invalid = recipients.filter((r) => !r.valid).length;

  return (
    <div
      className="compose-row compose-recipients"
      onClick={(e) => {
        if (e.target === e.currentTarget) inputRef.current?.focus();
      }}
    >
      <label className="compose-row-label" htmlFor={`${id}-input`}>
        {label}
      </label>
      <ul className="compose-chips" aria-label={`${label} recipients`}>
        {recipients.map((r) => (
          <li key={r.key} className="compose-chip" data-invalid={r.valid ? undefined : "true"}>
            <button type="button" className="compose-chip-text" title={r.valid ? formatAddress(r) : `“${r.raw}” isn't a valid email address`} onClick={() => edit(r)}>
              {chipText(r)}
              {r.valid ? null : <span className="visually-hidden"> (not a valid email address)</span>}
            </button>
            <button type="button" className="compose-chip-remove" aria-label={`Remove ${chipText(r)}`} onClick={() => remove(r)}>
              <X aria-hidden="true" />
            </button>
          </li>
        ))}
        <li className="compose-chip-input">
          <input
            ref={inputRef}
            id={`${id}-input`}
            className="compose-input"
            type="text"
            autoComplete="off"
            spellCheck={false}
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
            aria-invalid={invalid > 0 ? true : undefined}
            aria-describedby={invalid > 0 ? `${id}-invalid` : undefined}
            value={text}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            onBlur={() => commit(text)}
          />
        </li>
      </ul>
      {invalid > 0 ? (
        <span id={`${id}-invalid`} className="visually-hidden">
          {invalid === 1 ? "One address isn't valid." : `${invalid} addresses aren't valid.`}
        </span>
      ) : null}
      {trailing}
      <ul id={listId} role="listbox" aria-label={`Suggestions for ${label}`} className="compose-suggestions" hidden={!open}>
        {open
          ? suggestions.map((p, i) => (
              <li
                key={p.email}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                className="compose-suggestion"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(p)}
              >
                <span className="compose-suggestion-name">{p.name || p.email}</span>
                {p.name ? <span className="compose-suggestion-email">{p.email}</span> : null}
              </li>
            ))
          : null}
      </ul>
    </div>
  );
});
