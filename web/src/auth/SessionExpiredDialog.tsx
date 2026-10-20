// Shown over the app when a refresh was refused (the refresh token ran out,
// or the password changed). The app stays mounted underneath, so signing in
// again picks up where the user was.
//
// It cannot be dismissed: the only ways out are signing in again as the same
// account, or signing out. Escape is cancelled, `closedby="none"` stops the
// browser's own close requests where it is supported, and if the dialog closes
// anyway (Chrome lets a second Escape through as a non-cancelable cancel) it
// opens again at once. It is only mounted while the session is expired.

import type { SignInOutcome } from "@postern/jmap";
import { useEffect, useRef } from "react";
import { SignInForm } from "./SignInForm";

export interface SessionExpiredDialogProps {
  username: string;
  onSignIn: (username: string, password: string, mfaToken?: string) => Promise<SignInOutcome>;
  onSignOut: () => void;
}

function open(dialog: HTMLDialogElement): void {
  if (dialog.open || !dialog.isConnected) return;
  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", "");
}

export function SessionExpiredDialog({ username, onSignIn, onSignOut }: SessionExpiredDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    // Not in React's attribute list yet; the browser's close requests (Escape, back gesture) are refused.
    dialog.setAttribute("closedby", "none");
    open(dialog);
    return () => {
      if (typeof dialog.close === "function") dialog.close();
      else dialog.removeAttribute("open");
    };
  }, []);

  return (
    <dialog
      ref={ref}
      className="auth-dialog"
      aria-label="Session expired"
      onCancel={(e) => e.preventDefault()}
      onClose={() => {
        // Still mounted means still expired: open again rather than leave a live-looking app.
        if (ref.current) open(ref.current);
      }}
    >
      <SignInForm
        onSignIn={onSignIn}
        username={username}
        headingLevel={2}
        title="Your session expired"
        subtitle="Enter your password to keep going. Nothing you were doing is lost."
        secondary={
          <button type="button" className="auth-link" onClick={onSignOut}>
            Sign out
          </button>
        }
      />
    </dialog>
  );
}
