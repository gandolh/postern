// The Scheduled page at #scheduled: the messages Schedule send is
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
import { useToast } from "../components/ui/Toast";
import { cancelScheduled, formatSendTime, listScheduled, RECONCILE_MARGIN_MS, type ScheduledMessage } from "./schedule";
import { Button } from "../components/ui/Button";

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
        toast.show({
          message: outcome === "sent" ? "The message was already sent." : "Send canceled. The message is in Drafts.",
        });
      }
    } catch (err) {
      if (!isQuietError(err))
        toast.show({ message: "Couldn't cancel the send. Try again in a moment.", duration: null });
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
      <ul className="m-0 list-none p-0" aria-labelledby={headingId}>
        {items.map((m) => {
          const expanded = open === m.submissionId;
          const panelId = `${headingId}-${m.submissionId}`;
          const subject = m.subject.trim() || "(no subject)";
          return (
            <li
              key={m.submissionId}
              className="border-b border-border bg-row-read data-open:bg-row"
              data-open={expanded || undefined}
            >
              <button
                type="button"
                className="grid min-h-(--row-height) w-full cursor-pointer grid-cols-[minmax(8rem,13rem)_minmax(0,1fr)_auto] items-center gap-x-3 bg-transparent py-0 pr-3 pl-4 text-start text-md leading-tight text-text hover:bg-row-hover max-sm:grid-cols-[minmax(0,1fr)_auto] max-sm:gap-y-1 max-sm:px-3 max-sm:py-2"
                aria-expanded={expanded}
                aria-controls={panelId}
                onClick={() => setOpen(expanded ? null : m.submissionId)}
              >
                <span className="overflow-hidden text-ellipsis whitespace-nowrap">To: {names(m)}</span>
                <span className="overflow-hidden text-ellipsis whitespace-nowrap max-sm:col-span-full max-sm:row-2">
                  <span className="scheduled-subject">{subject}</span>
                  {m.preview ? <span className="text-text-muted"> – {m.preview}</span> : null}
                </span>
                <time className="text-sm font-semibold whitespace-nowrap text-accent" dateTime={m.sendAt}>
                  {formatSendTime(m.sendAt)}
                </time>
              </button>
              {expanded ? (
                <div id={panelId} className="grid justify-items-start gap-3 px-4 pt-2 pb-4">
                  <p className="text-sm text-text-muted">
                    Sends {formatSendTime(m.sendAt)} to{" "}
                    {m.to.map((a) => (a.name ? `${a.name} <${a.email}>` : a.email)).join(", ")}.
                  </p>
                  {m.preview ? <p className="max-w-[70ch] whitespace-pre-wrap">{m.preview}</p> : null}
                  <Button type="button" disabled={cancelling === m.submissionId} onClick={() => void cancel(m)}>
                    Cancel send
                  </Button>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    );

  return (
    <section className="scheduled-page @container/list flex h-full min-h-0 flex-col" aria-labelledby={headingId}>
      <h1 id={headingId} className="sr-only">
        Scheduled
      </h1>
      <div
        className="relative z-sticky flex min-h-(--toolbar-height) flex-none items-center gap-1 border-b border-border bg-surface px-2 max-sm:flex-wrap max-sm:gap-0 max-sm:px-1"
        role="toolbar"
        aria-label="Scheduled actions"
      >
        <IconButton label="Refresh" icon={RefreshCw} tooltip="start" onClick={() => void load()} />
      </div>
      <div className="min-h-0 flex-[1_1_auto] overflow-y-auto">{body}</div>
    </section>
  );
}
