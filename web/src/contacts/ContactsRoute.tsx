// The Contacts page at #contacts: list and search, add, edit (name, addresses,
// phones, a note) and delete with a confirmation. What is saved here is the
// owner's address book, so it shows on a phone through CardDAV.

import {
  contactDraft,
  contactEmails,
  contactName,
  contactNote,
  contactPhones,
  groupMembers,
  isGroup,
  type ContactCard,
  type ContactDraft,
} from "@postern/jmap";
import { Plus, Users } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { isQuietError } from "../actions/runner";
import { useJmap } from "../auth";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { EmptyState } from "../shell/states";
import { useToast } from "../components/ui/Toast";
import { contactsDirectory, useContactsSnapshot } from "./directory";
import { Button } from "../components/ui/Button";
import { Input, inputClass } from "../components/ui/Input";

const EMPTY: ContactDraft = { name: "", emails: [], phones: [], note: "" };

/** Cards whose name, address, phone or note contains what was typed (case-insensitive), by name. */
export function filterCards(cards: readonly ContactCard[], query: string): ContactCard[] {
  const q = query.trim().toLowerCase();
  const list = [...cards].sort((a, b) =>
    contactName(a).localeCompare(contactName(b), undefined, {
      sensitivity: "base",
    }),
  );
  if (!q) return list;
  return list.filter((c) =>
    [contactName(c), ...contactEmails(c), ...contactPhones(c), contactNote(c)].some((s) => s.toLowerCase().includes(q)),
  );
}

function lines(text: string): string[] {
  return text
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

type Editing = { kind: "new" } | { kind: "edit"; card: ContactCard };

export function ContactsRoute() {
  const client = useJmap();
  const directory = useMemo(() => contactsDirectory(client), [client]);
  const { status, cards, error } = useContactsSnapshot(directory);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Editing | null>(null);
  const [deleting, setDeleting] = useState<ContactCard | null>(null);
  const toast = useToast();

  useEffect(() => {
    const ac = new AbortController();
    void directory.load(ac.signal);
    return () => ac.abort();
  }, [directory]);

  const shown = useMemo(() => filterCards(cards, query), [cards, query]);

  async function confirmDelete() {
    const card = deleting;
    setDeleting(null);
    if (!card) return;
    try {
      await directory.remove(card);
      if (editing?.kind === "edit" && editing.card.id === card.id) setEditing(null);
      toast.show({ message: `Deleted ${contactName(card) || "contact"}` });
    } catch (e) {
      // Session trouble is the sign-in layer's to show.
      if (isQuietError(e)) return;
      toast.show({
        message: e instanceof Error ? `Could not delete: ${e.message}` : "Could not delete the contact",
        duration: null,
      });
    }
  }

  return (
    <section className="flex min-h-full flex-col" aria-labelledby="contacts-title">
      <header className="sticky top-0 z-header flex min-h-[calc(var(--toolbar-height)+0.5rem)] flex-wrap items-center gap-x-3 gap-y-1 border-b border-border bg-surface px-6 py-2 max-sm:px-4">
        <h1 id="contacts-title" className="text-xl font-bold">
          Contacts
        </h1>
        <span className="text-sm text-text-muted tabular-nums">
          {status === "ready" ? `${cards.length} ${cards.length === 1 ? "entry" : "entries"}` : null}
        </span>
        <Button
          variant="primary"
          type="button"
          className="ms-auto inline-flex items-center gap-2"
          onClick={() => setEditing({ kind: "new" })}
        >
          <Plus aria-hidden="true" /> Add contact
        </Button>
      </header>
      <div className="grid max-w-[70ch] grid-cols-[minmax(0,1fr)] items-start gap-6 p-6 text-text-muted lg:has-[form]:grid-cols-[minmax(0,1fr)_minmax(18rem,26rem)]">
        <div>
          <Input
            type="search"
            className="mb-3 w-full"
            aria-label="Search contacts"
            placeholder="Search contacts"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {status === "error" ? (
            <p role="alert" className="text-danger">
              Contacts could not be loaded{error ? `: ${error}` : ""}.{" "}
              <Button variant="quiet" type="button" onClick={() => void directory.load()}>
                Try again
              </Button>
            </p>
          ) : status !== "ready" ? (
            <p className="text-text-muted" role="status">
              Loading contacts…
            </p>
          ) : cards.length === 0 ? (
            <EmptyState icon={Users} title="No contacts yet">
              <p>Add one here, or from a sender's card in a conversation.</p>
            </EmptyState>
          ) : shown.length === 0 ? (
            <p className="text-text-muted">No contacts match “{query.trim()}”.</p>
          ) : (
            <ul className="m-0 list-none rounded-md border border-border bg-surface p-0" aria-label="Contacts">
              {shown.map((card) => (
                <li
                  key={card.id}
                  className="data-[selected=true]:bg-row-selected [&+&]:border-t [&+&]:border-border"
                  data-selected={editing?.kind === "edit" && editing.card.id === card.id ? "true" : undefined}
                >
                  <button
                    type="button"
                    className="flex min-h-(--row-height) w-full cursor-pointer items-baseline gap-4 bg-transparent px-(--row-padding-inline) py-2 text-start text-text hover:bg-row-hover"
                    onClick={() => setEditing({ kind: "edit", card })}
                  >
                    <span className="min-w-0 flex-[0_1_14rem] overflow-hidden font-medium text-ellipsis whitespace-nowrap">
                      {contactName(card) || "(no name)"}
                    </span>
                    <span className="min-w-0 flex-[1_1_auto] overflow-hidden text-ellipsis whitespace-nowrap text-text-muted">
                      {isGroup(card)
                        ? `Group, ${groupMembers(card, cards).length} members`
                        : (contactEmails(card)[0] ?? contactPhones(card)[0] ?? "")}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        {editing ? (
          <ContactForm
            key={editing.kind === "edit" ? editing.card.id : "new"}
            editing={editing}
            onCancel={() => setEditing(null)}
            onDelete={editing.kind === "edit" ? () => setDeleting(editing.card) : undefined}
            onSave={async (draft) => {
              try {
                if (editing.kind === "edit") await directory.update(editing.card, draft);
                else await directory.add(draft);
                toast.show({
                  message: editing.kind === "edit" ? "Contact saved" : "Contact added",
                });
                setEditing(null);
              } catch (e) {
                if (isQuietError(e)) return;
                toast.show({
                  message: e instanceof Error ? `Could not save: ${e.message}` : "Could not save the contact",
                  duration: null,
                });
              }
            }}
          />
        ) : null}
      </div>
      {deleting ? (
        <ConfirmDialog
          title="Delete this contact?"
          body={`${contactName(deleting) || "This contact"} will be removed from your address book, including on your phone.`}
          confirmLabel="Delete"
          onConfirm={() => void confirmDelete()}
          onCancel={() => setDeleting(null)}
        />
      ) : null}
    </section>
  );
}

interface FormProps {
  editing: Editing;
  onSave(draft: ContactDraft): Promise<void>;
  onCancel(): void;
  onDelete?: () => void;
}

function ContactForm({ editing, onSave, onCancel, onDelete }: FormProps) {
  const start = editing.kind === "edit" ? contactDraft(editing.card) : EMPTY;
  const group = editing.kind === "edit" && isGroup(editing.card);
  const [name, setName] = useState(start.name);
  const [emails, setEmails] = useState(start.emails.join("\n"));
  const [phones, setPhones] = useState(start.phones.join("\n"));
  const [note, setNote] = useState(start.note);
  const [saving, setSaving] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  useEffect(() => nameRef.current?.focus(), []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (saving || group) return;
    setSaving(true);
    try {
      await onSave({
        name,
        emails: lines(emails),
        phones: lines(phones),
        note,
      });
    } finally {
      setSaving(false);
    }
  }

  const heading = editing.kind === "new" ? "New contact" : "Edit contact";
  const valid = name.trim() !== "" || lines(emails).length > 0;

  return (
    <form
      className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4"
      onSubmit={(e) => void submit(e)}
      aria-labelledby="contacts-form-title"
    >
      <h2 id="contacts-form-title" className="m-0 text-lg">
        {heading}
      </h2>
      {group ? (
        <p className="text-text-muted">
          This is a group. Its members are managed on your phone or other address book app; here it can only be deleted.
        </p>
      ) : null}
      <label className="flex flex-col gap-1 text-sm text-text-muted [&_:is(input,select,textarea)]:text-md [&_:is(input,select,textarea)]:text-text">
        <span>Name</span>
        <Input
          ref={nameRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={group}
          autoComplete="off"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm text-text-muted [&_:is(input,select,textarea)]:text-md [&_:is(input,select,textarea)]:text-text">
        <span>Email addresses</span>
        <textarea
          className={inputClass()}
          rows={2}
          value={emails}
          onChange={(e) => setEmails(e.target.value)}
          disabled={group}
          placeholder="One per line"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm text-text-muted [&_:is(input,select,textarea)]:text-md [&_:is(input,select,textarea)]:text-text">
        <span>Phone numbers</span>
        <textarea
          className={inputClass()}
          rows={2}
          value={phones}
          onChange={(e) => setPhones(e.target.value)}
          disabled={group}
          placeholder="One per line"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm text-text-muted [&_:is(input,select,textarea)]:text-md [&_:is(input,select,textarea)]:text-text">
        <span>Note</span>
        <textarea
          className={inputClass()}
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          disabled={group}
        />
      </label>
      <div className="flex gap-2">
        {!group ? (
          <Button variant="primary" type="submit" disabled={saving || !valid}>
            Save
          </Button>
        ) : null}
        <Button type="button" onClick={onCancel}>
          Cancel
        </Button>
        {onDelete ? (
          <Button variant="quiet" type="button" className="ms-auto text-danger" onClick={onDelete}>
            Delete
          </Button>
        ) : null}
      </div>
    </form>
  );
}
