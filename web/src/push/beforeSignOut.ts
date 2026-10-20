// Brief 16's before-sign-out hook (destroy this device's JMAP
// PushSubscription while the tokens still work). The list itself is the
// app's, in auth/beforeSignOut.ts, and runs before every sign-out, the
// user's and the idle timeout's; these names stay for push's callers.

export { BEFORE_SIGN_OUT_MS, onBeforeSignOut, runBeforeSignOut, type BeforeSignOutHook } from "../auth/beforeSignOut";
