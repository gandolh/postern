// The account button at the end of the top bar, and its card: who is signed
// in, the link to Stalwart's account page, and Sign out.

import { ExternalLink, LogOut } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
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
  const id = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const name = account.name ?? account.username;
  const initial = initialOf(name);

  useEffect(() => {
    if (!open) return;
    panelRef.current?.querySelector<HTMLElement>("a, button")?.focus();
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!panelRef.current?.contains(target) && !buttonRef.current?.contains(target)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="shell-account">
      <button
        ref={buttonRef}
        type="button"
        className="shell-account-button"
        aria-label={`Account: ${account.name ? `${account.name} (${account.username})` : account.username}`}
        aria-expanded={open}
        aria-controls={open ? `${id}-panel` : undefined}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="shell-avatar" aria-hidden="true">
          {initial}
        </span>
      </button>
      {open ? (
        <div
          ref={panelRef}
          id={`${id}-panel`}
          className="shell-account-panel"
          role="dialog"
          aria-labelledby={`${id}-name`}
          onBlur={(event) => {
            const next = event.relatedTarget as Node | null;
            if (next && !event.currentTarget.contains(next) && !buttonRef.current?.contains(next)) setOpen(false);
          }}
        >
          <span className="shell-avatar shell-avatar-large" aria-hidden="true">
            {initial}
          </span>
          <p id={`${id}-name`} className="shell-account-name">
            {name}
          </p>
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
        </div>
      ) : null}
    </div>
  );
}
