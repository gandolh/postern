// <SessionProvider>: the sign-in page while signed out, the app while signed
// in, and the session-expired dialog over the app when a refresh is refused.
//
// One AuthSession per signed-in stint: signing out (by the user, or after the
// idle timeout) drops it together with the JmapClient, and unmounts the
// children, so every token, cache and piece of in-memory mail state goes with
// it. The next sign-in starts from a fresh one. Tokens never leave the
// AuthSession (corpus/wiki/security.md).

import { AuthSession, JmapClient, type FetchLike, type SignInOutcome } from "@postern/jmap";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { runBeforeSignOut } from "../push/beforeSignOut";
import "./auth.css";
import { API_BASE, redirectUri } from "./config";
import { SessionContext, type SignedInSession } from "./context";
import { SessionExpiredDialog } from "./SessionExpiredDialog";
import { SignInPage } from "./SignInPage";
import { useActivity } from "./useActivity";

/** Read once, when the provider mounts: changing them later would mean a new session. */
export interface SessionProviderProps {
  children: ReactNode;
  /** Where Stalwart is. Default `/webmail-api`. */
  baseUrl?: string;
  /** For tests: the fetch to reach Stalwart with. */
  fetch?: FetchLike;
  /** For tests: the idle timeout. Default 8 hours (`IDLE_TIMEOUT_MS`). */
  idleTimeoutMs?: number;
}

type View =
  | { kind: "signedOut"; auth: AuthSession; notice?: "idle" }
  | { kind: "signedIn"; auth: AuthSession; session: SignedInSession; expired: boolean };

export function SessionProvider({ children, baseUrl = API_BASE, fetch, idleTimeoutMs }: SessionProviderProps) {
  // Frozen at mount, so a parent re-rendering with a new `fetch` cannot sign the user out.
  const [options] = useState(() => ({ baseUrl, fetch, idleTimeoutMs }));
  const createAuth = useCallback(
    () => new AuthSession({ baseUrl: options.baseUrl, redirectUri: redirectUri(), fetch: options.fetch, idleTimeoutMs: options.idleTimeoutMs }),
    [options],
  );
  const [view, setView] = useState<View>(() => ({ kind: "signedOut", auth: createAuth() }));
  const { auth } = view;

  // Follow the token holder: expired, signed in again, signed out (by the user or the idle timeout).
  useEffect(() => {
    const unsubscribe = auth.onStatus((event) => {
      if (event.status === "signedOut") {
        setView({ kind: "signedOut", auth: createAuth(), notice: event.reason === "idle" ? "idle" : undefined });
      } else {
        const expired = event.status === "expired";
        setView((current) => (current.kind === "signedIn" && current.auth === auth && current.expired !== expired ? { ...current, expired } : current));
      }
    });
    return () => {
      unsubscribe();
      // Leaving the tree must not leave tokens or timers behind.
      void auth.signOut();
    };
  }, [auth, createAuth]);

  useActivity(auth, view.kind === "signedIn");

  const signIn = useCallback(
    async (username: string, password: string, mfaToken?: string): Promise<SignInOutcome> => {
      const outcome = await auth.signIn(username, password, { mfaToken });
      if (outcome === "mfaRequired") return outcome;
      const client = new JmapClient({ baseUrl: options.baseUrl, auth, fetch: options.fetch });
      try {
        await client.connect();
      } catch (err) {
        await auth.signOut();
        throw err;
      }
      const account = auth.account;
      if (!account) throw new Error("Signed in without an account");
      const session: SignedInSession = {
        client,
        account: account.name ? { username: account.username, name: account.name } : { username: account.username },
        // Brief 16: work that needs the tokens one last time (destroying this
        // device's Web Push subscription) runs first, for at most 2 s.
        signOut: async () => {
          await runBeforeSignOut();
          await auth.signOut("user");
        },
      };
      setView({ kind: "signedIn", auth, session, expired: false });
      return "signedIn";
    },
    [auth, options],
  );

  const signInAgain = useCallback(
    (_username: string, password: string, mfaToken?: string): Promise<SignInOutcome> => {
      const username = auth.account?.username;
      if (!username) return Promise.reject(new Error("No account to sign in again"));
      return auth.signIn(username, password, { mfaToken });
    },
    [auth],
  );

  if (view.kind === "signedOut") return <SignInPage onSignIn={signIn} notice={view.notice} />;

  return (
    <SessionContext.Provider value={view.session}>
      {children}
      {view.expired ? (
        <SessionExpiredDialog username={view.session.account.username} onSignIn={signInAgain} onSignOut={() => void view.session.signOut()} />
      ) : null}
    </SessionContext.Provider>
  );
}
