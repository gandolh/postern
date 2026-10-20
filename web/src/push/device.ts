// Naming this browser's subscription to Stalwart without storing anything
// (brief 16).
//
// PushSubscription/get never returns `url` or `keys` (Stalwart 0.16.25 refuses
// to: "forbidden"), so a device finds its own subscription by deviceClientId.
// RFC 8620 asks for a hash that differs per device and per user: here SHA-256
// of the client name, the account and the browser's push endpoint. The
// endpoint is this browser profile's own and changes whenever it re-subscribes,
// so a stale subscription never matches a fresh one.

export const CLIENT_NAME = "Postern";

export async function deviceClientId(username: string, endpoint: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${CLIENT_NAME}\n${username.toLowerCase()}\n${endpoint}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** A base64url VAPID key (the session's applicationServerKey) as bytes; Safari needs bytes, not the string. */
export function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(base64);
  const out = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

/** Whether a subscription was made with this server key (a changed VAPID key needs a new one). */
export function sameKey(current: ArrayBuffer | null | undefined, wanted: Uint8Array): boolean {
  if (!current) return false;
  const a = new Uint8Array(current);
  return a.length === wanted.length && a.every((b, i) => b === wanted[i]);
}
