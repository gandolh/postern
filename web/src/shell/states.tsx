// The layout states every screen shares: loading skeletons, the empty label,
// and connection lost. Later briefs render these rather than inventing their own.
//
//   <ListSkeleton rows={8} />                     conversation rows at the current density
//   <EmptyState title="No conversations in Spam">…</EmptyState>
//   <ConnectionLost onRetry={…} />                the server cannot be reached
//   emptyLabelMessage("Spam")                     "No conversations in Spam"
//   emptyLabelMessage("Spam", "message")          "No messages in Spam" (conversation view off)

import type { LucideIcon } from "lucide-react";
import type { RowNoun } from "../actions/copy";
import { Inbox, RefreshCw, WifiOff } from "lucide-react";
import { useSyncExternalStore, type ReactNode } from "react";
import { Button } from "../components/ui/Button";

/** Gmail's wording for a label with nothing in it; it counts messages with conversation view off. */
export function emptyLabelMessage(title: string, noun: RowNoun = "conversation"): string {
  return `No ${noun}s in ${title}`;
}

export interface EmptyStateProps {
  title: string;
  /** A line or two under the title, and any action. */
  children?: ReactNode;
  icon?: LucideIcon;
}

/** A quiet centred message for a label, search or page with nothing to show. */
export function EmptyState({ title, children, icon: Icon = Inbox }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
      <Icon className="mb-2 text-text-subtle [--icon-size:2.5rem] [--icon-stroke:1.25]" aria-hidden="true" />
      <p className="text-lg font-semibold">{title}</p>
      {children ? (
        <div className="flex max-w-[40ch] flex-col items-center gap-4 text-text-muted">{children}</div>
      ) : null}
    </div>
  );
}

const WIDTHS = [62, 48, 70, 55, 66, 44, 58, 51, 68, 46, 60, 53];

export interface ListSkeletonProps {
  /** How many rows; default 12. */
  rows?: number;
  /** Shimmer (loading). Default true; false draws still placeholder rows. */
  animated?: boolean;
  /** Read out while loading. Default "Loading conversations". */
  label?: string;
}

/** Placeholder conversation rows, `--row-height` tall, so they match the density. */
export function ListSkeleton({ rows = 12, animated = true, label = "Loading conversations" }: ListSkeletonProps) {
  return (
    <div
      className="group/skel"
      data-animated={animated ? undefined : "false"}
      role={animated ? "status" : undefined}
      aria-label={animated ? label : undefined}
    >
      {Array.from({ length: rows }, (_, i) => (
        <div
          className="grid h-(--row-height) grid-cols-[1.25rem_minmax(6rem,12rem)_minmax(0,1fr)_3.5rem] items-center gap-4 border-b border-border px-(--row-padding-inline) max-sm:grid-cols-[1.25rem_minmax(0,1fr)_3rem]"
          key={i}
          aria-hidden="true"
        >
          <span className="size-4 block rounded-sm bg-skeleton bg-[linear-gradient(90deg,var(--color-skeleton)_0%,var(--color-skeleton-shine)_50%,var(--color-skeleton)_100%)] bg-size-[200%_100%] bg-position-[0_0] motion-safe:animate-skeleton group-data-[animated=false]/skel:animate-none" />
          <span className="h-3 w-[70%] max-sm:hidden block rounded-sm bg-skeleton bg-[linear-gradient(90deg,var(--color-skeleton)_0%,var(--color-skeleton-shine)_50%,var(--color-skeleton)_100%)] bg-size-[200%_100%] bg-position-[0_0] motion-safe:animate-skeleton group-data-[animated=false]/skel:animate-none" />
          <span
            className="h-3 block rounded-sm bg-skeleton bg-[linear-gradient(90deg,var(--color-skeleton)_0%,var(--color-skeleton-shine)_50%,var(--color-skeleton)_100%)] bg-size-[200%_100%] bg-position-[0_0] motion-safe:animate-skeleton group-data-[animated=false]/skel:animate-none"
            style={{ width: `${WIDTHS[i % WIDTHS.length]}%` }}
          />
          <span className="h-3 w-full justify-self-end block rounded-sm bg-skeleton bg-[linear-gradient(90deg,var(--color-skeleton)_0%,var(--color-skeleton-shine)_50%,var(--color-skeleton)_100%)] bg-size-[200%_100%] bg-position-[0_0] motion-safe:animate-skeleton group-data-[animated=false]/skel:animate-none" />
        </div>
      ))}
    </div>
  );
}

/** Placeholder label rows for the navigation while the labels load. */
export function NavSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="in-data-[nav=rail]:hidden" aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <div className="flex h-(--nav-item-height) items-center gap-3 pr-3 pl-(--nav-inset)" key={i}>
          <span className="size-4.5 flex-none block rounded-sm bg-skeleton bg-[linear-gradient(90deg,var(--color-skeleton)_0%,var(--color-skeleton-shine)_50%,var(--color-skeleton)_100%)] bg-size-[200%_100%] bg-position-[0_0] motion-safe:animate-skeleton group-data-[animated=false]/skel:animate-none" />
          <span
            className="h-2.5 block rounded-sm bg-skeleton bg-[linear-gradient(90deg,var(--color-skeleton)_0%,var(--color-skeleton-shine)_50%,var(--color-skeleton)_100%)] bg-size-[200%_100%] bg-position-[0_0] motion-safe:animate-skeleton group-data-[animated=false]/skel:animate-none"
            style={{ width: `${WIDTHS[(i + 3) % WIDTHS.length]}%` }}
          />
        </div>
      ))}
    </div>
  );
}

export interface ConnectionLostProps {
  onRetry?: () => void;
  /** Default: the server cannot be reached. */
  title?: string;
  children?: ReactNode;
}

/** The main area when the mail server cannot be reached. */
export function ConnectionLost({ onRetry, title = "Can't reach the mail server", children }: ConnectionLostProps) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-12 text-center" role="alert">
      <WifiOff className="mb-2 text-text-subtle [--icon-size:2.5rem] [--icon-stroke:1.25]" aria-hidden="true" />
      <p className="text-lg font-semibold">{title}</p>
      <div className="flex max-w-[40ch] flex-col items-center gap-4 text-text-muted">
        {children ?? <p>Check your connection. Postern tries again when the connection comes back.</p>}
        {onRetry ? (
          <Button type="button" onClick={onRetry}>
            <RefreshCw aria-hidden="true" />
            Try again
          </Button>
        ) : null}
      </div>
    </div>
  );
}

// ---- Online / offline --------------------------------------------------------

function subscribeOnline(listener: () => void): () => void {
  window.addEventListener("online", listener);
  window.addEventListener("offline", listener);
  return () => {
    window.removeEventListener("online", listener);
    window.removeEventListener("offline", listener);
  };
}

/** The browser's idea of whether it is online, live. */
export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
}

/** A slim bar over the main area while the browser is offline or the server unreachable. */
export function ConnectionBanner({
  offline,
  unreachable,
  onRetry,
}: {
  offline: boolean;
  unreachable: boolean;
  onRetry?: () => void;
}) {
  if (!offline && !unreachable) return null;
  return (
    <div
      className="flex min-h-11 flex-none items-center gap-3 rounded-lg bg-warning-soft py-2 pr-2 pl-4 text-on-warning-soft [&_p]:flex-[1_1_auto]"
      role="status"
    >
      <WifiOff aria-hidden="true" />
      <p>
        {offline
          ? "You're offline. Postern reconnects when your connection is back."
          : "Can't reach the mail server. Some counts may be out of date."}
      </p>
      {!offline && onRetry ? (
        <Button
          variant="quiet"
          type="button"
          className="font-semibold text-on-warning-soft underline hover:bg-transparent hover:text-on-warning-soft"
          onClick={onRetry}
        >
          Try again
        </Button>
      ) : null}
    </div>
  );
}
