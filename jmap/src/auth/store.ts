// Where AuthSession keeps what survives a reload (brief 27). The package
// touches no browser storage: the web app hands AuthSession an adapter
// (sessionStorage, in web/src/auth/sessionStore.ts), tests a memory one.
//
// Kept: the refresh token, the account as the UI shows it, and the time of
// the last activity. Never the access token.

/** What a reload needs to sign in again without the password. */
export interface StoredSession {
  refreshToken: string;
  /** The address the account signs in with. Compared before another account signs in. */
  username: string;
  /** The display name, if the account has one. */
  name?: string;
  /** The last user activity, in ms since the epoch: the idle clock goes on from here after a reload. */
  lastActivity: number;
}

/** The adapter. None of the three may throw; storage that cannot be used behaves as empty. */
export interface SessionStore {
  load(): StoredSession | undefined;
  save(session: StoredSession): void;
  clear(): void;
}

/** A store in memory, for tests and for Node. `current` is what it holds. */
export function memorySessionStore(initial?: StoredSession): SessionStore & { current: StoredSession | undefined } {
  const store = {
    current: initial,
    load: () => (store.current ? { ...store.current } : undefined),
    save: (session: StoredSession) => {
      store.current = { ...session };
    },
    clear: () => {
      store.current = undefined;
    },
  };
  return store;
}
