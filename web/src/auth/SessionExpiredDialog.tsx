// Shown over the app when a refresh was refused (the refresh token ran out,
// or the password changed). The app stays mounted underneath, so signing in
// again picks up where the user was.
//
// It cannot be dismissed: the only ways out are signing in again as the same
// account, or signing out. A Base UI dialog (components/ui/Modal) that ignores Escape
// and a press on the backdrop, so there is no browser close request to fight.
// It is only mounted while the session is expired, and it opens over the
// composer if that is full screen.

import type { SignInOutcome } from "@postern/jmap";
import { Modal } from "../components/ui/Modal";
import { SignInForm } from "./SignInForm";

export interface SessionExpiredDialogProps {
  username: string;
  onSignIn: (username: string, password: string, mfaToken?: string) => Promise<SignInOutcome>;
  onSignOut: () => void;
}

export function SessionExpiredDialog({ username, onSignIn, onSignOut }: SessionExpiredDialogProps) {
  return (
    <Modal className="auth-dialog" dismissible={false} onClose={() => {}} initialFocus="input[name=password]">
      <Modal.Title className="visually-hidden">Session expired</Modal.Title>
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
    </Modal>
  );
}
