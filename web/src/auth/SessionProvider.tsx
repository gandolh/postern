// <SessionProvider>: the sign-in page while signed out, the app while signed
// in, and the session-expired dialog over the app when a refresh is refused.
//
// One AuthSession per signed-in stint: signing out (by the user, or after the
// idle timeout) drops it together with the JmapClient, and unmounts the
// children, so every token, cache and piece of in-memory mail state goes with
// it. The next sign-in starts from a fresh one. Tokens never leave the
// AuthSession (corpus/wiki/security.md).
//
// Before either sign-out drops the tokens, the app's before-sign-out hooks
// run (./beforeSignOut.ts: unsaved drafts, a message held for Undo, Web
// Push), for at most BEFORE_SIGN_OUT_MS.

import { AuthSession, JmapClient, type FetchLike, type SignInOutcome } from "@postern/jmap";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { clearPendingPatches } from "../actions/bus";
import { clearUndo } from "../actions/undo";
import "./auth.css";
import { BEFORE_SIGN_OUT_MS, runBeforeSignOut } from "./beforeSignOut";
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

/**
 * Nothing of the session that just ended may reach the next one in this tab.
 * The address bar goes back to /webmail/ with no hash: a `#search/<query>/<id>`
 * left there would be the next person's first screen, and their search box
 * would show the query. replaceState swaps the current entry instead of
 * adding one. The page cannot erase the earlier history entries, so Back can
 * still reach the old hashes; they open on the sign-in page. The undo list
 * (closures over the old client) goes too, and so do the optimistic patches
 * still waiting on a write (actions/bus.ts).
 */
function forgetTheSession(): void {
  clearUndo();
  clearPendingPatches();
  window.history.replaceState(null, "", redirectUri());
}

export function SessionProvider({ children, baseUrl = API_BASE, fetch, idleTimeoutMs }: SessionProviderProps) {
  // Frozen at mount, so a parent re-rendering with a new `fetch` cannot sign the user out.
  const [options] = useState(() => ({ baseUrl, fetch, idleTimeoutMs }));
  const createAuth = useCallback(
    () =>
      new AuthSession({
        baseUrl: options.baseUrl,
        redirectUri: redirectUri(),
        fetch: options.fetch,
        idleTimeoutMs: options.idleTimeoutMs,
        beforeSignOutMs: BEFORE_SIGN_OUT_MS,
      }),
    [options],
  );
  const [view, setView] = useState<View>(() => ({ kind: "signedOut", auth: createAuth() }));
  const { auth } = view;
  // The AuthSession whose app is on screen (a sign-in whose connect failed never showed one).
  const shown = useRef<AuthSession | null>(null);

  // Follow the token holder: expired, signed in again, signed out (by the user or the idle timeout).
  useEffect(() => {
    // The app's hooks, before every sign-out of this session; the same bound on both sides.
    const offBeforeSignOut = auth.onBeforeSignOut(() => runBeforeSignOut(BEFORE_SIGN_OUT_MS));
    const unsubscribe = auth.onStatus((event) => {
      if (event.status === "signedOut") {
        if (shown.current === auth) {
          shown.current = null;
          forgetTheSession();
        }
        setView({ kind: "signedOut", auth: createAuth(), notice: event.reason === "idle" ? "idle" : undefined });
      } else {
        const expired = event.status === "expired";
        setView((current) => (current.kind === "signedIn" && current.auth === auth && current.expired !== expired ? { ...current, expired } : current));
      }
    });
    return () => {
      offBeforeSignOut();
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
        // The before-sign-out hooks run inside (see the effect above).
        signOut: () => auth.signOut("user"),
      };
      shown.current = auth;
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
