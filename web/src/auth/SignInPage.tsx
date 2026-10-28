// The sign-in page: Postern's two-step sign-in, shaped like Gmail's.

import type { SignInOutcome } from "@postern/jmap";
import { useSyncExternalStore } from "react";
import { STALWART_ACCOUNT_URL } from "./config";
import { SignInForm } from "./SignInForm";

/** Why the form shows when it was not the user's choice: the idle timeout, or a reload that could not reach the server (brief 27). */
export type SignInNotice = "idle" | "offline";

export interface SignInPageProps {
  onSignIn: (username: string, password: string, mfaToken?: string) => Promise<SignInOutcome>;
  notice?: SignInNotice;
}

function subscribeOnline(onChange: () => void): () => void {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

/** The installed app opens offline to this page (tokens die with the tab), so say why signing in can't work yet. */
function useOnline(): boolean {
  return useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
}

export function SignInPage({ onSignIn, notice }: SignInPageProps) {
  const online = useOnline();
  return (
    <main className="auth-page">
      <div className="auth-card">
        <p className="auth-wordmark">Postern</p>
        {notice === "idle" ? (
          <p className="auth-notice" role="status">
            You were signed out after a long time without activity. Sign in again to continue.
          </p>
        ) : null}
        {online && notice !== "offline" ? null : (
          <p className="auth-notice" role="status">
            You're offline. Postern keeps no mail on this device, so connect to sign in.
          </p>
        )}
        <SignInForm onSignIn={onSignIn} title="Sign in" subtitle="with your mail account, to continue to Postern" />
      </div>
      {STALWART_ACCOUNT_URL ? (
        <p className="auth-footer">
          Change your password, turn on 2-step verification or create app passwords for mail apps on{" "}
          <a href={STALWART_ACCOUNT_URL} target="_blank" rel="noopener noreferrer">
            your account page
          </a>
          .
        </p>
      ) : null}
    </main>
  );
}

/** Brief 27: while a reload signs in again from the kept refresh token. Quiet: no form, no flash of one. */
export function ResumingPage() {
  return (
    <main className="auth-page" aria-busy="true">
      <div className="auth-card auth-resuming">
        <p className="auth-wordmark">Postern</p>
        <p className="auth-resuming-text" role="status">
          Signing you in…
        </p>
      </div>
    </main>
  );
}
