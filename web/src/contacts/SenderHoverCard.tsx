// The card a sender's name opens: name, address, "Add to contacts", "Email",
// "Search mail from". It opens when the pointer rests on the sender and when
// keyboard focus lands on it; Escape closes it, and it stays open while focus
// is inside it (it sits right after the sender in tab order).
//
//   <SenderHoverCard address={from}> …the sender's heading… </SenderHoverCard>

import type { EmailAddress } from "@postern/jmap";
import { Mail, Search, UserPlus } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type FocusEvent, type ReactNode } from "react";
import { isQuietError } from "../actions/runner";
import { useJmap } from "../auth";
import { useCompose } from "../composer/compose";
import { nameOrAddress } from "../conversation/people";
import { quoteArg } from "../search/suggestions";
import { navigate } from "../shell/router";
import { useToast } from "../components/ui/Toast";
import { contactsDirectory, useContactsSnapshot } from "./directory";
import { Button } from "../components/ui/Button";

/** How long the pointer must rest before the card opens, and how long it may be away before it closes. */
export const OPEN_DELAY_MS = 250;
export const CLOSE_DELAY_MS = 200;

export interface SenderHoverCardProps {
  /** The sender. Nothing is shown (and nothing wraps) without one. */
  address: EmailAddress | null;
  children: ReactNode;
}

export function SenderHoverCard({ address, children }: SenderHoverCardProps) {
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const root = useRef<HTMLDivElement>(null);
  const cardId = useId();
  useEffect(() => () => clearTimeout(timer.current), []);
  if (!address) return <>{children}</>;

  const schedule = (next: boolean, delay: number) => {
    clearTimeout(timer.current);
    if (delay === 0) setOpen(next);
    else timer.current = setTimeout(() => setOpen(next), delay);
  };

  return (
    <div
      ref={root}
      className="relative inline-block max-w-full"
      onMouseEnter={() => schedule(true, OPEN_DELAY_MS)}
      onMouseLeave={() => schedule(false, CLOSE_DELAY_MS)}
      onFocus={() => schedule(true, 0)}
      onBlur={(e: FocusEvent) => {
        if (!e.relatedTarget || !root.current?.contains(e.relatedTarget)) schedule(false, 0);
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) {
          e.stopPropagation();
          schedule(false, 0);
        }
      }}
    >
      {children}
      {open ? <HoverCardBody id={cardId} address={address} close={() => schedule(false, 0)} /> : null}
    </div>
  );
}

function HoverCardBody({ id, address, close }: { id: string; address: EmailAddress; close: () => void }) {
  const client = useJmap();
  const directory = useMemo(() => contactsDirectory(client), [client]);
  // The snapshot re-renders this card when the directory changes, so the
  // lookup below always reads the current cards.
  const { status } = useContactsSnapshot(directory);
  const compose = useCompose();
  const toast = useToast();
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    const ac = new AbortController();
    void directory.ensureFresh(ac.signal);
    return () => ac.abort();
  }, [directory]);

  const known = status === "ready" ? directory.find(address.email) : undefined;
  const name = nameOrAddress(address);

  async function add() {
    setAdding(true);
    try {
      await directory.add({
        name: address.name?.trim() || "",
        emails: [address.email],
        phones: [],
        note: "",
      });
      toast.show({
        message: `Added ${name} to your contacts`,
        action: {
          label: "View",
          onClick: () => navigate({ kind: "contacts" }),
        },
      });
    } catch (e) {
      // Session trouble is the sign-in layer's to show.
      if (!isQuietError(e)) {
        toast.show({
          message: e instanceof Error ? `Could not add the contact: ${e.message}` : "Could not add the contact",
          duration: null,
        });
      }
    } finally {
      setAdding(false);
    }
  }

  return (
    <div
      id={id}
      className="absolute start-0 top-full z-card flex max-w-[min(24rem,90vw)] min-w-64 flex-col gap-2 rounded-lg border border-border bg-surface-raised p-3 shadow-md"
      role="group"
      aria-label={`About ${name}`}
    >
      <p className="m-0 font-semibold wrap-anywhere">
        <bdi>{name}</bdi>
      </p>
      <p className="m-0 text-sm text-text-muted wrap-anywhere">
        <bdi>{address.email}</bdi>
      </p>
      <div className="mt-1 flex flex-wrap gap-2">
        {known ? (
          <Button
            variant="quiet"
            type="button"
            onClick={() => {
              close();
              navigate({ kind: "contacts" });
            }}
          >
            In your contacts
          </Button>
        ) : (
          <Button variant="quiet" type="button" disabled={adding || status !== "ready"} onClick={() => void add()}>
            <UserPlus aria-hidden="true" /> Add to contacts
          </Button>
        )}
        <Button
          variant="quiet"
          type="button"
          onClick={() => {
            close();
            compose.open({ mode: "new", to: [address] });
          }}
        >
          <Mail aria-hidden="true" /> Email
        </Button>
        <Button
          variant="quiet"
          type="button"
          onClick={() => {
            close();
            navigate({
              kind: "search",
              query: `from:${quoteArg(address.email)}`,
            });
          }}
        >
          <Search aria-hidden="true" /> Search mail from
        </Button>
      </div>
    </div>
  );
}
