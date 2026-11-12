// The sign-in page: Postern's two-step sign-in, shaped like Gmail's.

import type { SignInOutcome } from "@postern/jmap";
import { useSyncExternalStore } from "react";
import { STALWART_ACCOUNT_URL } from "./config";
import { SignInForm } from "./SignInForm";

/** Why the form shows when it was not the user's choice: the idle timeout, or a reload that could not reach the server. */
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
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
}

export function SignInPage({ onSignIn, notice }: SignInPageProps) {
  const online = useOnline();
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-canvas p-4 text-text">
      <div className="w-full max-w-md rounded-xl border border-border bg-surface px-8 pt-10 pb-8 text-text shadow-sm max-sm:px-5 max-sm:pt-8 max-sm:pb-6">
        <p className="mb-6 flex items-center gap-2 text-xl font-semibold tracking-[-0.01em] before:size-7 before:flex-none before:bg-accent before:[mask:var(--mask-mark)_center/contain_no-repeat] before:content-['']">
          Postern
        </p>
        {notice === "idle" ? (
          <p className="m-0 mb-4 rounded-md bg-accent-soft px-4 py-3 text-on-accent-soft" role="status">
            You were signed out after a long time without activity. Sign in again to continue.
          </p>
        ) : null}
        {online && notice !== "offline" ? null : (
          <p className="m-0 mb-4 rounded-md bg-accent-soft px-4 py-3 text-on-accent-soft" role="status">
            You're offline. Postern keeps no mail on this device, so connect to sign in.
          </p>
        )}
        <SignInForm onSignIn={onSignIn} title="Sign in" subtitle="with your mail account, to continue to Postern" />
      </div>
      {STALWART_ACCOUNT_URL ? (
        <p className="m-0 mb-3 max-w-md text-center text-sm text-text-muted">
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

/** While a reload signs in again from the kept refresh token. Quiet: no form, no flash of one. */
export function ResumingPage() {
  return (
    <main
      className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-canvas p-4 text-text"
      aria-busy="true"
    >
      <div className="w-full max-w-md rounded-xl border border-border bg-surface px-8 pt-10 pb-8 text-text shadow-sm max-sm:px-5 max-sm:pt-8 max-sm:pb-6">
        <p className="mb-3 flex items-center gap-2 text-xl font-semibold tracking-[-0.01em] before:size-7 before:flex-none before:bg-accent before:[mask:var(--mask-mark)_center/contain_no-repeat] before:content-['']">
          Postern
        </p>
        <p className="m-0 text-text-muted" role="status">
          Signing you in…
        </p>
      </div>
    </main>
  );
}
