// The sign-in page: Postern's two-step sign-in, shaped like Gmail's.

import type { SignInOutcome } from "@postern/jmap";
import { STALWART_ACCOUNT_URL } from "./config";
import { SignInForm } from "./SignInForm";

export interface SignInPageProps {
  onSignIn: (username: string, password: string, mfaToken?: string) => Promise<SignInOutcome>;
  /** Why the last session ended, when it was not the user's choice. */
  notice?: "idle";
}

export function SignInPage({ onSignIn, notice }: SignInPageProps) {
  return (
    <main className="auth-page">
      <div className="auth-card">
        <p className="auth-wordmark">Postern</p>
        {notice === "idle" ? (
          <p className="auth-notice" role="status">
            You were signed out after a long time without activity. Sign in again to continue.
          </p>
        ) : null}
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
