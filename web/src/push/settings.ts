// "Notify me when Postern is closed" (brief 16): a per-device, per-account
// choice, OFF until the person turns it on, kept like brief 11's desktop
// notifications in this browser's localStorage. Nothing in it is secret: an
// on/off flag and the deviceClientId (a hash) of the subscription this
// browser last verified, so a sign-in can extend it rather than make a new one.

import { isRecord, readRaw, writeRaw } from "../prefs/storage";

const PREFIX = "postern.webPush.";

export interface WebPushChoice {
  on: boolean;
  /** deviceClientId of the subscription verified from this browser, if any. */
  verified: string | null;
}

const OFF: WebPushChoice = Object.freeze({ on: false, verified: null });

function key(username: string): string {
  return PREFIX + username.toLowerCase();
}

export function readChoice(username: string): WebPushChoice {
  const raw = readRaw(key(username));
  if (!isRecord(raw)) return OFF;
  return {
    on: raw["on"] === true,
    verified: typeof raw["verified"] === "string" && raw["verified"] !== "" ? raw["verified"] : null,
  };
}

export function writeChoice(username: string, patch: Partial<WebPushChoice>): WebPushChoice {
  const next = { ...readChoice(username), ...patch };
  writeRaw(key(username), next);
  return next;
}
