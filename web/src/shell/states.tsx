// The layout states every screen shares: loading skeletons, the empty label,
// and connection lost. Later briefs render these rather than inventing their own.
//
//   <ListSkeleton rows={8} />                     conversation rows at the current density
//   <EmptyState title="No conversations in Spam">…</EmptyState>
//   <ConnectionLost onRetry={…} />                the server cannot be reached
//   emptyLabelMessage("Spam")                     "No conversations in Spam"

import type { LucideIcon } from "lucide-react";
import { Inbox, RefreshCw, WifiOff } from "lucide-react";
import { useSyncExternalStore, type ReactNode } from "react";

/** Gmail's wording for a label with nothing in it. */
export function emptyLabelMessage(title: string): string {
  return `No conversations in ${title}`;
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
    <div className="shell-empty">
      <Icon className="shell-empty-icon" aria-hidden="true" />
      <p className="shell-empty-title">{title}</p>
      {children ? <div className="shell-empty-body">{children}</div> : null}
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
    <div className="shell-list-skeleton" data-animated={animated ? undefined : "false"} role={animated ? "status" : undefined} aria-label={animated ? label : undefined}>
      {Array.from({ length: rows }, (_, i) => (
        <div className="shell-list-skeleton-row" key={i} aria-hidden="true">
          <span className="skeleton shell-skeleton-check" />
          <span className="skeleton shell-skeleton-sender" />
          <span className="skeleton shell-skeleton-subject" style={{ width: `${WIDTHS[i % WIDTHS.length]}%` }} />
          <span className="skeleton shell-skeleton-date" />
        </div>
      ))}
    </div>
  );
}

/** Placeholder label rows for the navigation while the labels load. */
export function NavSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="shell-nav-skeleton" aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <div className="shell-nav-skeleton-row" key={i}>
          <span className="skeleton shell-skeleton-icon" />
          <span className="skeleton shell-skeleton-text" style={{ width: `${WIDTHS[(i + 3) % WIDTHS.length]}%` }} />
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
    <div className="shell-empty" role="alert">
      <WifiOff className="shell-empty-icon" aria-hidden="true" />
      <p className="shell-empty-title">{title}</p>
      <div className="shell-empty-body">
        {children ?? <p>Check your connection. Postern tries again when the connection comes back.</p>}
        {onRetry ? (
          <button type="button" className="btn" onClick={onRetry}>
            <RefreshCw aria-hidden="true" />
            Try again
          </button>
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
export function ConnectionBanner({ offline, unreachable, onRetry }: { offline: boolean; unreachable: boolean; onRetry?: () => void }) {
  if (!offline && !unreachable) return null;
  return (
    <div className="shell-banner" role="status">
      <WifiOff aria-hidden="true" />
      <p>{offline ? "You're offline. Postern reconnects when your connection is back." : "Can't reach the mail server. Some counts may be out of date."}</p>
      {!offline && onRetry ? (
        <button type="button" className="btn btn-quiet shell-banner-action" onClick={onRetry}>
          Try again
        </button>
      ) : null}
    </div>
  );
}
