// The account button at the end of the top bar, and its card (a Base UI
// popover): who is signed in, the link to Stalwart's account page, and Sign out.

import { ExternalLink, LogOut } from "lucide-react";
import { Popover } from "@base-ui/react/popover";
import { useRef, useState } from "react";
import { STALWART_ACCOUNT_URL, useAccount, useSignOut } from "../auth";

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
    <div className="shell-account">
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger
          ref={buttonRef}
          className="shell-account-button"
          aria-label={`Account: ${account.name ? `${account.name} (${account.username})` : account.username}`}
        >
          <span className="shell-avatar" aria-hidden="true">
            {initial}
          </span>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Positioner className="shell-account-positioner" side="bottom" align="end" sideOffset={8} collisionPadding={8}>
            <Popover.Popup
              className="shell-account-panel"
              onBlur={(event) => {
                const next = event.relatedTarget as Node | null;
                if (next && !event.currentTarget.contains(next) && !buttonRef.current?.contains(next)) setOpen(false);
              }}
            >
              <span className="shell-avatar shell-avatar-large" aria-hidden="true">
                {initial}
              </span>
              <Popover.Title render={<p className="shell-account-name" />}>{name}</Popover.Title>
              {account.name ? <p className="shell-account-address">{account.username}</p> : null}
              {STALWART_ACCOUNT_URL ? (
                <a className="btn shell-account-manage" href={STALWART_ACCOUNT_URL} target="_blank" rel="noopener noreferrer">
                  Manage your account
                  <ExternalLink aria-hidden="true" />
                  <span className="visually-hidden">(opens in a new tab)</span>
                </a>
              ) : null}
              <button
                type="button"
                className="btn btn-quiet shell-account-signout"
                disabled={busy}
                onClick={() => {
                  setBusy(true);
                  void signOut();
                }}
              >
                <LogOut aria-hidden="true" />
                {busy ? "Signing out…" : "Sign out"}
              </button>
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
}
