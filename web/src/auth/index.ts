// Sign-in, the signed-in session, and sign-out for the rest of the app (brief 04).
//
//   <SessionProvider>          sign-in page until signed in, then its children
//   useJmap(): JmapClient      the connected client, base URL /webmail-api
//   useAccount(): Account      { username, name? }
//   useSignOut()               () => Promise<void>
//   STALWART_ACCOUNT_URL       Stalwart's account page (password, 2-step verification, app passwords)

export { SessionProvider, type SessionProviderProps } from "./SessionProvider";
export { useJmap, useAccount, useSignOut, type Account, type SignedInSession } from "./context";
export { STALWART_ACCOUNT_URL, API_BASE } from "./config";
