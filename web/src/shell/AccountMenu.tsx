// The account button at the end of the top bar, and its card (a Base UI
// popover): who is signed in, the link to Stalwart's account page, and Sign out.

import { ExternalLink, LogOut } from "lucide-react";
import { Popover } from "../components/ui/Popover";
import { useRef, useState } from "react";
import { STALWART_ACCOUNT_URL, useAccount, useSignOut } from "../auth";
import { Button, buttonClass } from "../components/ui/Button";

function initialOf(text: string): string {
  const letter = [...text.trim()][0];
  return letter ? letter.toLocaleUpperCase() : "?";
}

export function AccountMenu() {
  const account = useAccount();
  const signOut = useSignOut();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const name = account.name ?? account.username;
  const initial = initialOf(name);

  // A Base UI popover: focus moves in on open and back on Escape, and a press
  // outside closes it. Focus leaving it (Tab past Sign out) closes it too.
  return (
    <div className="relative ml-1">
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger
          ref={buttonRef}
          className="grid size-11 cursor-pointer place-items-center rounded-pill bg-transparent p-0 hover:bg-hover aria-expanded:bg-hover"
          aria-label={`Account: ${account.name ? `${account.name} (${account.username})` : account.username}`}
        >
          <span
            className="grid size-8 place-items-center rounded-pill bg-accent text-md leading-none font-semibold text-on-accent"
            aria-hidden="true"
          >
            {initial}
          </span>
        </Popover.Trigger>
        <Popover.Popup
          positionerClassName="z-overlay"
          align="end"
          sideOffset={8}
          className="flex w-[min(20rem,calc(100vw-1rem))] flex-col items-center gap-1 rounded-xl border border-border bg-surface-raised px-4 pt-6 pb-4 text-center shadow-lg motion-safe:animate-pop"
          onBlur={(event) => {
            const next = event.relatedTarget as Node | null;
            if (next && !event.currentTarget.contains(next) && !buttonRef.current?.contains(next)) setOpen(false);
          }}
        >
          <span
            className="mb-1 grid size-16 place-items-center rounded-pill bg-accent text-[1.75rem] leading-none font-semibold text-on-accent"
            aria-hidden="true"
          >
            {initial}
          </span>
          <Popover.Title render={<p className="max-w-full text-lg font-semibold wrap-anywhere" />}>
            {name}
          </Popover.Title>
          {account.name ? <p className="max-w-full wrap-anywhere text-text-muted">{account.username}</p> : null}
          {STALWART_ACCOUNT_URL ? (
            <a
              className={buttonClass("default", "mt-3 rounded-pill [&_.lucide]:[--icon-size:1rem]")}
              href={STALWART_ACCOUNT_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              Manage your account
              <ExternalLink aria-hidden="true" />
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          ) : null}
          <Button
            variant="quiet"
            type="button"
            className="mt-3 self-stretch rounded-t-none rounded-b-md border-t-border pt-3"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void signOut();
            }}
          >
            <LogOut aria-hidden="true" />
            {busy ? "Signing out…" : "Sign out"}
          </Button>
        </Popover.Popup>
      </Popover.Root>
    </div>
  );
}
