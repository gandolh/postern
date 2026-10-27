// The Scheduled page at #scheduled (brief 23): the messages Schedule send is
// holding on the server, soonest first, each with its send time. Opening one
// shows its recipients and text and offers "Cancel send", which leaves it a
// draft in Drafts. It looks again when it opens, on focus, after any mail
// change, and a little after the next send time, filing in Sent what went.

import type { Id } from "@postern/jmap";
import { Clock, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { subscribeMailChanges } from "../actions/bus";
import { isQuietError } from "../actions/runner";
import { useJmap } from "../auth";
import { useOptionalComposerStore } from "../composer/compose";
import { IconButton } from "../shell/IconButton";
import { ConnectionLost, EmptyState, ListSkeleton } from "../shell/states";
import { useToast } from "../shell/toast";
import { cancelScheduled, formatSendTime, listScheduled, RECONCILE_MARGIN_MS, type ScheduledMessage } from "./schedule";
import "./scheduled.css";

type Status = "loading" | "ready" | "error";

function names(message: ScheduledMessage): string {
  return message.to.map((a) => a.name || a.email).join(", ") || "(no recipients)";
}

export function ScheduledRoute() {
  const client = useJmap();
  const composer = useOptionalComposerStore();
  const toast = useToast();
  const [status, setStatus] = useState<Status>("loading");
  const [items, setItems] = useState<readonly ScheduledMessage[]>([]);
  const [open, setOpen] = useState<Id | null>(null);
  const [cancelling, setCancelling] = useState<Id | null>(null);
  const loading = useRef<Promise<void> | null>(null);
  const headingId = useId();

  const load = useCallback((): Promise<void> => {
    loading.current ??= (async () => {
      try {
        // What went out since the last look is filed in Sent first.
        await composer?.scheduled.run();
        const next = await listScheduled(client);
        setItems(next);
        setStatus("ready");
      } catch (err) {
        if (!isQuietError(err)) setStatus((s) => (s === "ready" ? s : "error"));
      } finally {
        loading.current = null;
      }
    })();
    return loading.current;
  }, [client, composer]);

  useEffect(() => {
    void load();
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    const offBus = subscribeMailChanges((change) => {
      if (change.kind === "settled") void load();
    });
    return () => {
      window.removeEventListener("focus", onFocus);
      offBus();
    };
  }, [load]);

  // A message leaves the page when it goes: look again a little after the soonest.
  const soonest = items[0]?.sendAt;
  useEffect(() => {
    if (!soonest) return;
    const delay = Math.min(Math.max(0, Date.parse(soonest) + RECONCILE_MARGIN_MS - Date.now()), 2_000_000_000);
    const timer = setTimeout(() => void load(), delay);
    return () => clearTimeout(timer);
  }, [soonest, load]);

  const cancel = async (message: ScheduledMessage) => {
    setCancelling(message.submissionId);
    try {
      if (composer) await composer.cancelScheduled(message.submissionId, message.emailId);
      else {
        const outcome = await cancelScheduled(client, message.submissionId, message.emailId);
        toast.show({ message: outcome === "sent" ? "The message was already sent." : "Send canceled. The message is in Drafts." });
      }
    } catch (err) {
      if (!isQuietError(err)) toast.show({ message: "Couldn't cancel the send. Try again in a moment." });
    } finally {
      setCancelling(null);
      setOpen(null);
      await load();
    }
  };

  let body;
  if (status === "loading") body = <ListSkeleton rows={4} />;
  else if (status === "error")
    body = (
      <ConnectionLost title="Scheduled messages didn't load" onRetry={() => void load()}>
        <p>Something went wrong on the way. Try again in a moment.</p>
      </ConnectionLost>
    );
  else if (items.length === 0)
    body = (
      <EmptyState icon={Clock} title="No scheduled messages">
        <p>To send a message later, use Schedule send in the menu beside Send.</p>
      </EmptyState>
    );
  else
    body = (
      <ul className="scheduled-list" aria-labelledby={headingId}>
        {items.map((m) => {
          const expanded = open === m.submissionId;
          const panelId = `${headingId}-${m.submissionId}`;
          const subject = m.subject.trim() || "(no subject)";
          return (
            <li key={m.submissionId} className="scheduled-item" data-open={expanded || undefined}>
              <button type="button" className="scheduled-summary" aria-expanded={expanded} aria-controls={panelId} onClick={() => setOpen(expanded ? null : m.submissionId)}>
                <span className="scheduled-to">To: {names(m)}</span>
                <span className="scheduled-text">
                  <span className="scheduled-subject">{subject}</span>
                  {m.preview ? <span className="scheduled-preview"> – {m.preview}</span> : null}
                </span>
                <time className="scheduled-when" dateTime={m.sendAt}>
                  {formatSendTime(m.sendAt)}
                </time>
              </button>
              {expanded ? (
                <div id={panelId} className="scheduled-panel">
                  <p className="scheduled-panel-line">
                    Sends {formatSendTime(m.sendAt)} to {m.to.map((a) => (a.name ? `${a.name} <${a.email}>` : a.email)).join(", ")}.
                  </p>
                  {m.preview ? <p className="scheduled-panel-preview">{m.preview}</p> : null}
                  <button type="button" className="btn" disabled={cancelling === m.submissionId} onClick={() => void cancel(m)}>
                    Cancel send
                  </button>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    );

  return (
    <section className="list-page scheduled-page" aria-labelledby={headingId}>
      <h1 id={headingId} className="visually-hidden">
        Scheduled
      </h1>
      <div className="list-toolbar" role="toolbar" aria-label="Scheduled actions">
        <IconButton label="Refresh" icon={RefreshCw} tooltip="start" onClick={() => void load()} />
      </div>
      <div className="scheduled-body">{body}</div>
    </section>
  );
}
