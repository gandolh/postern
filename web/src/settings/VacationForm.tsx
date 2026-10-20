// The vacation responder (JMAP VacationResponse). Applies as you go: the
// switch and the dates on change, the text fields when they lose focus.
// Plain text body only. Stalwart has no "only people in my Contacts" option on
// VacationResponse, so it is not offered.
//
// Stalwart keeps the responder in a Sieve script named "vacation" and runs one
// script at a time (brief 13, filters/filterScript.ts): turning the responder
// on stops Postern's filters, and turning it off leaves no script running. So
// with filters in place this asks before turning it on, and turns the filters
// back on after turning it off.

import type { VacationResponse } from "@postern/jmap";
import { useEffect, useId, useState } from "react";
import { useJmap } from "../auth";
import { useFilters } from "../filters/store";
import { ConfirmDialog } from "../list/ConfirmDialog";
import "../list/list.css";
import { serverHas } from "./capability";
import { useSaved } from "./useSaved";

export const FILTERS_STOP_WARNING = "Your filters stop while the vacation responder is on: Stalwart runs one script at a time.";

const CAPABILITY = "urn:ietf:params:jmap:vacationresponse";

/** "2026-10-21T00:00:00Z" -> "2026-10-21" for <input type="date">. */
export function dateOnly(utc: string | null): string {
  return utc ? utc.slice(0, 10) : "";
}

/** The first day starts at 00:00 UTC and the last day ends at 23:59:59 UTC. */
export function toUtc(date: string, edge: "start" | "end"): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  return `${date}T${edge === "start" ? "00:00:00" : "23:59:59"}Z`;
}

export function VacationForm() {
  const client = useJmap();
  const supported = serverHas(client, CAPABILITY);
  const [value, setValue] = useState<VacationResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const { note, save } = useSaved();
  const id = useId();
  const filters = useFilters();
  const [confirmOn, setConfirmOn] = useState(false);
  const [filtersNote, setFiltersNote] = useState<string | null>(null);

  useEffect(() => {
    if (!supported) return;
    const controller = new AbortController();
    client.vacationResponse.get({ signal: controller.signal }).then(
      (v) => setValue(v),
      (error: unknown) => {
        if (!controller.signal.aborted) setLoadError(error instanceof Error ? error.message : "unknown error");
      },
    );
    return () => controller.abort();
  }, [client, supported]);

  if (!supported) return null;
  if (loadError) {
    return (
      <section className="settings-section" aria-labelledby={`${id}-h`}>
        <h2 id={`${id}-h`} className="settings-heading">
          Vacation responder
        </h2>
        <p role="alert">Could not load the vacation responder: {loadError}</p>
      </section>
    );
  }
  if (!value) {
    return (
      <section className="settings-section" aria-labelledby={`${id}-h`} aria-busy="true">
        <h2 id={`${id}-h`} className="settings-heading">
          Vacation responder
        </h2>
        <p className="settings-hint">Loading&hellip;</p>
      </section>
    );
  }

  const commit = (patch: Partial<Omit<VacationResponse, "id">>) => {
    const next = { ...value, ...patch };
    setValue(next);
    return save(() => client.vacationResponse.set(patch));
  };

  // Postern's filter script with something in it: the responder would stop it.
  const loaded = filters.loaded;
  const hasFilters = loaded !== null && loaded.scriptId !== null && loaded.problem === null && loaded.set.filters.length + loaded.set.blocked.length + loaded.set.includes.length > 0;

  const turnOn = async () => {
    setConfirmOn(false);
    setFiltersNote(null);
    if (await commit({ isEnabled: true })) void filters.store.load(true);
  };

  const turnOff = async () => {
    setFiltersNote(null);
    if (!(await commit({ isEnabled: false }))) return;
    // Nothing runs now: bring Postern's filters back, if it has a script.
    await filters.store.load(true);
    const now = filters.store.getSnapshot().loaded;
    if (!now || now.scriptId === null || now.problem !== null || now.active) return;
    try {
      await filters.store.turnOn();
      setFiltersNote("Your filters are on again.");
    } catch (e) {
      setFiltersNote(`The vacation responder is off, but your filters didn't come back on (${e instanceof Error ? e.message : "unknown error"}). Turn them on in Settings, under Filters.`);
    }
  };

  const toggle = (on: boolean) => {
    if (!on) void turnOff();
    else if (hasFilters) setConfirmOn(true);
    else void turnOn();
  };

  return (
    <section className="settings-section" aria-labelledby={`${id}-h`}>
      <h2 id={`${id}-h`} className="settings-heading">
        Vacation responder
      </h2>
      <label className="settings-check">
        <input type="checkbox" checked={value.isEnabled} onChange={(e) => toggle(e.target.checked)} />
        Vacation responder on
      </label>
      {hasFilters ? <p className="settings-hint">{value.isEnabled ? "Your filters are off while the vacation responder is on." : FILTERS_STOP_WARNING}</p> : null}
      {filtersNote ? (
        <p className="settings-hint" role="status">
          {filtersNote}
        </p>
      ) : null}
      {confirmOn ? (
        <ConfirmDialog
          title="Turn on the vacation responder?"
          body={`${FILTERS_STOP_WARNING} They come back when you turn it off.`}
          confirmLabel="Turn it on"
          onConfirm={() => void turnOn()}
          onCancel={() => setConfirmOn(false)}
        />
      ) : null}
      <div className="settings-row">
        <div className="settings-field">
          <label htmlFor={`${id}-from`} className="settings-label">
            First day
          </label>
          <input id={`${id}-from`} type="date" className="input" value={dateOnly(value.fromDate)} onChange={(e) => void commit({ fromDate: toUtc(e.target.value, "start") })} />
        </div>
        <div className="settings-field">
          <label htmlFor={`${id}-to`} className="settings-label">
            Last day
          </label>
          <input id={`${id}-to`} type="date" className="input" value={dateOnly(value.toDate)} min={dateOnly(value.fromDate)} onChange={(e) => void commit({ toDate: toUtc(e.target.value, "end") })} />
        </div>
      </div>
      <TextField id={`${id}-subject`} label="Subject" value={value.subject ?? ""} onCommit={(subject) => void commit({ subject: subject || null })} />
      <TextField id={`${id}-body`} label="Message" multiline value={value.textBody ?? ""} onCommit={(textBody) => void commit({ textBody: textBody || null })} />
      {note}
    </section>
  );
}

interface TextFieldProps {
  id: string;
  label: string;
  value: string;
  multiline?: boolean;
  onCommit: (value: string) => void;
}

/** A text field that keeps its own draft and commits when it loses focus. */
export function TextField({ id, label, value, multiline, onCommit }: TextFieldProps) {
  const [draft, setDraft] = useState(value);
  // Take a new value from outside (a reload, a saved change) without an effect.
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    setDraft(value);
  }
  const commit = () => {
    if (draft !== value) onCommit(draft);
  };
  return (
    <div className="settings-field">
      <label htmlFor={id} className="settings-label">
        {label}
      </label>
      {multiline ? (
        <textarea id={id} className="input settings-textarea" rows={5} value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={commit} />
      ) : (
        <input id={id} type="text" className="input" value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={commit} />
      )}
    </div>
  );
}
