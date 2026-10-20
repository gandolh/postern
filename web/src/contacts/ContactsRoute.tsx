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
import { useJmap } from "../auth";
import { ConfirmDialog } from "../list/ConfirmDialog";
import { EmptyState } from "../shell/states";
import { useToast } from "../shell/toast";
import "./contacts.css";
import { contactsDirectory, useContactsSnapshot } from "./directory";

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
  return list.filter((c) => [contactName(c), ...contactEmails(c), ...contactPhones(c), contactNote(c)].some((s) => s.toLowerCase().includes(q)));
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
      toast.show({
        message: e instanceof Error ? `Could not delete: ${e.message}` : "Could not delete the contact",
      });
    }
  }

  return (
    <section className="shell-page contacts-page" aria-labelledby="contacts-title">
      <header className="shell-page-header">
        <h1 id="contacts-title" className="shell-page-title">
          Contacts
        </h1>
        <span className="shell-page-meta">{status === "ready" ? `${cards.length} ${cards.length === 1 ? "entry" : "entries"}` : null}</span>
        <button type="button" className="btn btn-primary contacts-add" onClick={() => setEditing({ kind: "new" })}>
          <Plus aria-hidden="true" /> Add contact
        </button>
      </header>
      <div className="shell-page-body contacts-body">
        <div className="contacts-list-pane">
          <input
            type="search"
            className="input contacts-search"
            aria-label="Search contacts"
            placeholder="Search contacts"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {status === "error" ? (
            <p role="alert" className="contacts-error">
              Contacts could not be loaded{error ? `: ${error}` : ""}.{" "}
              <button type="button" className="btn btn-quiet" onClick={() => void directory.load()}>
                Try again
              </button>
            </p>
          ) : status !== "ready" ? (
            <p className="contacts-status" role="status">
              Loading contacts…
            </p>
          ) : cards.length === 0 ? (
            <EmptyState icon={Users} title="No contacts yet">
              <p>Add one here, or from a sender's card in a conversation.</p>
            </EmptyState>
          ) : shown.length === 0 ? (
            <p className="contacts-status">No contacts match “{query.trim()}”.</p>
          ) : (
            <ul className="contacts-list" aria-label="Contacts">
              {shown.map((card) => (
                <li key={card.id} className="contacts-item" data-selected={editing?.kind === "edit" && editing.card.id === card.id ? "true" : undefined}>
                  <button type="button" className="contacts-row" onClick={() => setEditing({ kind: "edit", card })}>
                    <span className="contacts-name">{contactName(card) || "(no name)"}</span>
                    <span className="contacts-sub">
                      {isGroup(card) ? `Group, ${groupMembers(card, cards).length} members` : (contactEmails(card)[0] ?? contactPhones(card)[0] ?? "")}
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
                toast.show({
                  message: e instanceof Error ? `Could not save: ${e.message}` : "Could not save the contact",
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
    <form className="contacts-form" onSubmit={(e) => void submit(e)} aria-labelledby="contacts-form-title">
      <h2 id="contacts-form-title" className="contacts-form-title">
        {heading}
      </h2>
      {group ? (
        <p className="contacts-note">This is a group. Its members are managed on your phone or other address book app; here it can only be deleted.</p>
      ) : null}
      <label className="contacts-field">
        <span>Name</span>
        <input ref={nameRef} className="input" value={name} onChange={(e) => setName(e.target.value)} disabled={group} autoComplete="off" />
      </label>
      <label className="contacts-field">
        <span>Email addresses</span>
        <textarea className="input" rows={2} value={emails} onChange={(e) => setEmails(e.target.value)} disabled={group} placeholder="One per line" />
      </label>
      <label className="contacts-field">
        <span>Phone numbers</span>
        <textarea className="input" rows={2} value={phones} onChange={(e) => setPhones(e.target.value)} disabled={group} placeholder="One per line" />
      </label>
      <label className="contacts-field">
        <span>Note</span>
        <textarea className="input" rows={3} value={note} onChange={(e) => setNote(e.target.value)} disabled={group} />
      </label>
      <div className="contacts-actions">
        {!group ? (
          <button type="submit" className="btn btn-primary" disabled={saving || !valid}>
            Save
          </button>
        ) : null}
        <button type="button" className="btn" onClick={onCancel}>
          Cancel
        </button>
        {onDelete ? (
          <button type="button" className="btn btn-quiet contacts-delete" onClick={onDelete}>
            Delete
          </button>
        ) : null}
      </div>
    </form>
  );
}
