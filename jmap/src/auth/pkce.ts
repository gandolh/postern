// PKCE (RFC 7636) with the S256 method, the only one Stalwart advertises.
// Web Crypto only, so it runs the same in browsers and Node 24.

/** A PKCE pair. The verifier stays in memory for the one sign-in it belongs to. */
export interface PkcePair {
  /** 43 unreserved characters (32 random bytes, base64url). Sent to the token endpoint. */
  verifier: string;
  /** base64url(SHA-256(verifier)). Sent with the credentials. */
  challenge: string;
}

/** base64url without padding (RFC 4648 §5). */
export function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** The S256 challenge for a verifier. */
export async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64Url(new Uint8Array(digest));
}

/** A fresh verifier and its S256 challenge. */
export async function createPkce(): Promise<PkcePair> {
  const verifier = base64Url(crypto.getRandomValues(new Uint8Array(32)));
  return { verifier, challenge: await pkceChallenge(verifier) };
}
