// What the sign-in screens say when something goes wrong. Stalwart answers a
// wrong password, an unknown address and a disabled account the same way, so
// one message has to cover all three.

import { JmapNetworkError, SignInError } from "@postern/jmap";

export type SignInStep = "password" | "code";

export function signInErrorMessage(err: unknown, step: SignInStep): string {
  if (err instanceof SignInError) {
    switch (err.reason) {
      case "rejected":
        return step === "code"
          ? "Wrong code. Try again."
          : "Wrong email or password. Try again. If you're sure both are right, the account may be disabled: ask your mail administrator.";
      case "rateLimited":
        return "Too many attempts. Wait a minute, then try again.";
      case "blocked":
        return "Too many failed sign-ins from this network, so it is blocked for a while. Try again later.";
      case "network":
        return "Can't reach the mail server. Check your connection and try again.";
      case "server":
        return "The mail server couldn't sign you in just now. Try again in a moment.";
    }
  }
  if (err instanceof JmapNetworkError) return "Can't reach the mail server. Check your connection and try again.";
  return "Something went wrong while signing in. Try again.";
}

/** True when the answer means the typed secret was wrong, so the field should be cleared. */
export function isRejected(err: unknown): boolean {
  return err instanceof SignInError && err.reason === "rejected";
}
