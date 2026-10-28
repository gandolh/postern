// <SessionProvider>: the sign-in page while signed out, the app while signed
// in, and the session-expired dialog over the app when a refresh is refused.
//
// One AuthSession per signed-in stint: signing out (by the user, or after the
// idle timeout) drops it together with the JmapClient, and unmounts the
// children, so every token, cache and piece of in-memory mail state goes with
// it. The next sign-in starts from a fresh one. The access token never leaves
// the AuthSession; since brief 27 the refresh token goes to this tab's
// sessionStorage (./sessionStore.ts), so a reload signs in again with one
// refresh grant: a quiet "Signing you in" page instead of the form while it
// runs. Closing the tab ends it (corpus/wiki/security.md).
//
// Before either sign-out drops the tokens, the app's before-sign-out hooks
// run (./beforeSignOut.ts: unsaved drafts, a message held for Undo, Web
// Push), for at most BEFORE_SIGN_OUT_MS.

import { AuthSession, JmapClient, JmapNetworkError, type FetchLike, type SessionStore, type SignInOutcome } from "@postern/jmap";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { clearPendingPatches } from "../actions/bus";
import { clearUndo } from "../actions/undo";
import "./auth.css";
import { BEFORE_SIGN_OUT_MS, runBeforeSignOut } from "./beforeSignOut";
import { API_BASE, redirectUri } from "./config";
import { SessionContext, type SignedInSession } from "./context";
import { SessionExpiredDialog } from "./SessionExpiredDialog";
import { browserSessionStore } from "./sessionStore";
import { ResumingPage, SignInPage, type SignInNotice } from "./SignInPage";
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
  /** For tests: where a reload finds the session. Default this tab's sessionStorage. */
  store?: SessionStore;
}

type View =
  | { kind: "resuming"; auth: AuthSession }
  | { kind: "signedOut"; auth: AuthSession; notice?: SignInNotice }
  | { kind: "signedIn"; auth: AuthSession; session: SignedInSession; expired: boolean };

/**
 * Nothing of the session that just ended may reach the next one in this tab.
 * The address bar goes back to the base (`/`) with no hash: a `#search/<query>/<id>`
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

export function SessionProvider({ children, baseUrl = API_BASE, fetch, idleTimeoutMs, store }: SessionProviderProps) {
  // Frozen at mount, so a parent re-rendering with a new `fetch` cannot sign the user out.
  const [options] = useState(() => ({ baseUrl, fetch, idleTimeoutMs, store: store ?? browserSessionStore }));
  const createAuth = useCallback(
    () =>
      new AuthSession({
        baseUrl: options.baseUrl,
        redirectUri: redirectUri(),
        fetch: options.fetch,
        idleTimeoutMs: options.idleTimeoutMs,
        beforeSignOutMs: BEFORE_SIGN_OUT_MS,
        store: options.store,
      }),
    [options],
  );
  // A reload with a session kept in this tab resumes it before the form shows (brief 27).
  const [view, setView] = useState<View>(() => {
    const auth = createAuth();
    return auth.resumable() ? { kind: "resuming", auth } : { kind: "signedOut", auth };
  });
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

  /** Signed in (by the form or a resume): connect the client and show the app. A failed connect signs out. */
  const openApp = useCallback(async (): Promise<void> => {
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
  }, [auth, options]);

  const signIn = useCallback(
    async (username: string, password: string, mfaToken?: string): Promise<SignInOutcome> => {
      const outcome = await auth.signIn(username, password, { mfaToken });
      if (outcome === "mfaRequired") return outcome;
      await openApp();
      return "signedIn";
    },
    [auth, openApp],
  );

  // Brief 27: a reload signs in again from the refresh token this tab kept.
  // A refused token, or the idle deadline passed meanwhile, clears it and shows
  // the form (with the idle notice for the second); a server out of reach
  // shows the form with the offline notice, and the token stays for the next
  // reload. Under StrictMode the first run is cancelled by the cleanup above
  // (a sign-out of a session never started), which leaves the store alone.
  const resuming = view.kind === "resuming";
  useEffect(() => {
    if (!resuming) return;
    let live = true;
    const show = (notice?: SignInNotice) =>
      setView((current) => (current.kind === "signedIn" ? current : { kind: "signedOut", auth: current.auth, ...(notice ? { notice } : {}) }));
    void auth.resume().then(async (outcome) => {
      if (!live || outcome === "cancelled") return;
      if (outcome !== "resumed") {
        show(outcome === "idle" ? "idle" : outcome === "unreachable" ? "offline" : undefined);
        return;
      }
      try {
        await openApp();
      } catch (err) {
        if (live) show(err instanceof JmapNetworkError ? "offline" : undefined);
      }
    });
    return () => {
      live = false;
    };
  }, [resuming, auth, openApp]);

  const signInAgain = useCallback(
    (_username: string, password: string, mfaToken?: string): Promise<SignInOutcome> => {
      const username = auth.account?.username;
      if (!username) return Promise.reject(new Error("No account to sign in again"));
      return auth.signIn(username, password, { mfaToken });
    },
    [auth],
  );

  if (view.kind === "resuming") return <ResumingPage />;
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
