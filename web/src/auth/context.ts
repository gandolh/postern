// What the rest of the app gets from the signed-in session. Everything under
// <SessionProvider> renders only while signed in, so these hooks never return
// "nobody".

import type { JmapClient } from "@postern/jmap";
import { createContext, useContext } from "react";

/** The signed-in account. */
export interface Account {
  /** The address the account signs in with, e.g. `alice@postern.test`. */
  username: string;
  /** The display name (the account's description in Stalwart), if it has one. */
  name?: string;
}

export interface SignedInSession {
  /** Connected: `client.session` is loaded. Base URL `/webmail-api`. */
  client: JmapClient;
  account: Account;
  /** Forget the tokens and return to the sign-in page. Stalwart cannot revoke them. */
  signOut: () => Promise<void>;
}

export const SessionContext = createContext<SignedInSession | null>(null);

function useSignedIn(hook: string): SignedInSession {
  const value = useContext(SessionContext);
  if (!value) throw new Error(`${hook} must be used inside <SessionProvider>, which renders its children only when signed in`);
  return value;
}

/** The signed-in JMAP client (connected; base URL `/webmail-api`). */
export function useJmap(): JmapClient {
  return useSignedIn("useJmap").client;
}

/** The signed-in account: its address and display name. */
export function useAccount(): Account {
  return useSignedIn("useAccount").account;
}

/** Signs out: forgets the tokens and every in-memory cache, and shows the sign-in page. */
export function useSignOut(): () => Promise<void> {
  return useSignedIn("useSignOut").signOut;
}
