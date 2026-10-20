// RFC 6238 TOTP for the sign-in tests: a random secret, its otpauth:// URL and
// the current code. HMAC-SHA1, 6 digits, 30 seconds: what Stalwart's totp-rs
// expects by default. Test-only; the app never computes codes.

import { createHmac, randomBytes } from "node:crypto";

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** RFC 4648 base32, no padding (what otpauth URLs carry). */
export function base32(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

/** The HOTP value (RFC 4226) for a counter. */
export function hotp(key: Uint8Array, counter: number, digits = 6): string {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const mac = createHmac("sha1", key).update(message).digest();
  const offset = mac[mac.length - 1]! & 0x0f;
  const code = (mac.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits;
  return String(code).padStart(digits, "0");
}

/** The TOTP code (RFC 6238) at `time` (ms). */
export function totp(key: Uint8Array, time = Date.now(), stepSeconds = 30): string {
  return hotp(key, Math.floor(time / 1000 / stepSeconds));
}

/** A fresh 160-bit secret and its otpauth:// URL. */
export function newTotpSecret(account: string, issuer = "Postern"): { key: Uint8Array; url: string } {
  const key = new Uint8Array(randomBytes(20));
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(account)}`;
  const url = `otpauth://totp/${label}?secret=${base32(key)}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
  return { key, url };
}
