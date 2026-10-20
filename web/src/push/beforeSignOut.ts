// Work that needs the tokens one last time before a sign-out drops them
// (brief 16: destroy this device's JMAP PushSubscription). The auth provider
// calls runBeforeSignOut() when the person signs out (auth/SessionProvider.tsx,
// its one call site); the idle timeout signs out inside AuthSession without it,
// so hooks must not be the only cleanup (push/PushHost.tsx also unsubscribes
// the browser on unmount, which needs no token).
//
// Nothing here imports auth: auth depends on this file.

import { withDeadline } from "./deadline";

export type BeforeSignOutHook = () => Promise<unknown> | unknown;

/** The longest a sign-out waits on the hooks. */
export const BEFORE_SIGN_OUT_MS = 2000;

const hooks = new Set<BeforeSignOutHook>();

/** Run `hook` before the next user sign-out, while the tokens still work. Returns the unregister. */
export function onBeforeSignOut(hook: BeforeSignOutHook): () => void {
  hooks.add(hook);
  return () => {
    hooks.delete(hook);
  };
}

/** Runs every hook, in parallel, for at most `ms`. Never throws, never hangs. */
export async function runBeforeSignOut(ms: number = BEFORE_SIGN_OUT_MS): Promise<void> {
  if (hooks.size === 0) return;
  await withDeadline(Promise.allSettled([...hooks].map((hook) => Promise.resolve().then(hook))), ms);
}
