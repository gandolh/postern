// Sign-in through Stalwart and the token holder (brief 04); since brief 27 the
// refresh token can be kept in a store the app provides, so a reload resumes.

export {
  AuthSession,
  REFRESH_LEAD_MS,
  BEFORE_SIGN_OUT_MS,
  ACTIVITY_SAVE_MS,
  type ResumeOutcome,
  type BeforeSignOutHook,
  type AuthSessionOptions,
  type AuthStatus,
  type AuthStatusEvent,
  type AuthAccount,
  type SignInOutcome,
  type SignInOptions,
  type SignOutReason,
} from "./session.js";
export { IdleTimeout, IDLE_TIMEOUT_MS, type IdleTimeoutOptions } from "./idle.js";
export { memorySessionStore, type SessionStore, type StoredSession } from "./store.js";
export { SignInError, TokenEndpointError, SessionExpiredError, SignedOutError, type SignInFailure } from "./errors.js";
export {
  POSTERN_CLIENT_ID,
  DEFAULT_SCOPE,
  requestAuthCode,
  exchangeCode,
  refreshGrant,
  fetchUserInfo,
  type AuthCodeRequest,
  type AuthCodeResult,
  type TokenGrant,
  type UserInfo,
} from "./protocol.js";
export { createPkce, pkceChallenge, type PkcePair } from "./pkce.js";
