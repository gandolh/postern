// Work that needs the tokens one last time before a sign-out drops them:
// save every unsaved draft and send the messages held for Undo
// (composer/compose.ts), destroy this device's Web Push subscription
// (push/PushHost.tsx). One list for the app. SessionProvider hands it to each
// AuthSession, which awaits it before every sign-out, the user's and the idle
// timeout's, for at most BEFORE_SIGN_OUT_MS, while the tokens still work. A
// sign-out of an expired session has no tokens to lend and skips it, so hooks
// must not be the only cleanup (push/PushHost.tsx also unsubscribes the
// browser on unmount, which needs no token).
//
// Nothing here imports the rest of the app.

import { BEFORE_SIGN_OUT_MS } from "@postern/jmap";

export { BEFORE_SIGN_OUT_MS };

export type BeforeSignOutHook = () => Promise<unknown> | unknown;

const hooks = new Set<BeforeSignOutHook>();

/** Run `hook` before every sign-out, while the tokens still work. Returns the unregister. */
export function onBeforeSignOut(hook: BeforeSignOutHook): () => void {
  hooks.add(hook);
  return () => {
    hooks.delete(hook);
  };
}

/** Runs every hook, in parallel, for at most `ms`. Never throws, never hangs. */
export async function runBeforeSignOut(ms: number = BEFORE_SIGN_OUT_MS): Promise<void> {
  if (hooks.size === 0) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, ms);
  });
  try {
    await Promise.race([Promise.allSettled([...hooks].map((hook) => Promise.resolve().then(hook))), deadline]);
  } finally {
    clearTimeout(timer);
  }
}
