import { SessionProvider, STALWART_ACCOUNT_URL, useAccount, useSignOut } from "./auth";

/** Until brief 05's shell: who is signed in, and a way out. */
function SignedIn() {
  const account = useAccount();
  const signOut = useSignOut();
  return (
    <main className="auth-page">
      <div className="auth-card">
        <p className="auth-wordmark">Postern</p>
        <p>
          Signed in as <strong>{account.username}</strong>
          {account.name ? ` (${account.name})` : null}
        </p>
        <div className="auth-actions">
          {STALWART_ACCOUNT_URL ? (
            <a href={STALWART_ACCOUNT_URL} target="_blank" rel="noopener noreferrer">
              Manage your account
            </a>
          ) : null}
          <button type="button" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      </div>
    </main>
  );
}

export function App() {
  return (
    <SessionProvider>
      <SignedIn />
    </SessionProvider>
  );
}
