// Sign-in against the dev Stalwart (brief 04): alice without TOTP, bob with
// TOTP turned on for the test and off again, a wrong password, refresh, and
// what sign-out can and cannot do. Restores what it changes: bob's TOTP is off
// again at the end, so Basic auth keeps working for the other tests. No
// secret is printed, even on failure: tokens are only ever compared as
// booleans or passed to probe(), which returns a status.

import { afterAll, describe, expect, it } from "vitest";
import { AuthSession, JmapClient, SignInError, SignedOutError, type AuthProvider } from "../../src/index.js";
import { BASE, basicAuth, live } from "./live.js";
import { hotp, newTotpSecret, totp } from "./totp.js";

const REDIRECT = "http://localhost:5173/webmail/";
const STALWART = "urn:stalwart:jmap";

const password = (account: "alice" | "bob"): string => process.env[account === "alice" ? "ALICE_PASSWORD" : "BOB_PASSWORD"] ?? "";
const newSession = (): AuthSession => new AuthSession({ baseUrl: BASE, redirectUri: REDIRECT });

/** GET /jmap/session with a raw Authorization value: the status and how many accounts it shows. */
async function probe(authorization: string): Promise<{ status: number; accounts: number }> {
  const res = await fetch(`${BASE}/jmap/session`, { headers: { authorization } });
  const body = res.status === 200 ? ((await res.json()) as { accounts: Record<string, unknown> }) : undefined;
  if (!body) await res.body?.cancel();
  return { status: res.status, accounts: Object.keys(body?.accounts ?? {}).length };
}

/** `x:AccountPassword/set` on the singleton, as the signed-in account. */
async function setAccountPassword(auth: AuthProvider, patch: Record<string, unknown>): Promise<void> {
  const client = new JmapClient({ baseUrl: BASE, auth });
  const request = client.request().using(STALWART);
  const handle = request.callRaw("x:AccountPassword/set", { update: { singleton: patch } }, STALWART);
  const result = (await request.send()).get(handle) as { updated?: Record<string, unknown>; notUpdated?: Record<string, { description?: string }> };
  if (!result.updated || !("singleton" in result.updated)) {
    throw new Error(`x:AccountPassword/set failed: ${result.notUpdated?.["singleton"]?.description ?? "no reason given"}`);
  }
}

async function otpAuthOf(auth: AuthProvider): Promise<Record<string, unknown>> {
  const client = new JmapClient({ baseUrl: BASE, auth });
  const request = client.request().using(STALWART);
  const handle = request.callRaw("x:AccountPassword/get", { ids: null }, STALWART);
  const result = (await request.send()).get(handle) as { list: { otpAuth?: Record<string, unknown> }[] };
  return result.list[0]?.otpAuth ?? {};
}

describe("the TOTP test helper", () => {
  it("matches RFC 4226 appendix D", () => {
    const key = new TextEncoder().encode("12345678901234567890");
    expect([0, 1, 2, 9].map((c) => hotp(key, c))).toEqual(["755224", "287082", "359152", "520489"]);
  });
});

describe.skipIf(!live)("against the dev Stalwart: signing in", () => {
  const sessions: AuthSession[] = [];
  const track = (s: AuthSession): AuthSession => (sessions.push(s), s);
  afterAll(async () => {
    for (const s of sessions) await s.signOut();
  });

  it("signs alice in without TOTP and reads her mailbox with the Bearer token", async () => {
    const auth = track(newSession());
    expect(await auth.signIn("alice@postern.test", password("alice"))).toBe("signedIn");
    expect(auth.account).toEqual({ id: expect.any(String), username: "alice@postern.test", name: "Alice Archer" });
    // Booleans only, so a failure never prints the token.
    expect(/^Bearer sw1\./.test(await auth.authorization())).toBe(true);

    const client = new JmapClient({ baseUrl: BASE, auth });
    const session = await client.connect();
    expect(session.username).toBe("alice@postern.test");
    expect((await client.mailbox.all()).some((m) => m.role === "inbox")).toBe(true);
  });

  it("refreshes against the real token endpoint; the refresh token is not rotated", async () => {
    const auth = track(newSession());
    await auth.signIn("alice@postern.test", password("alice"));
    const before = await auth.authorization();
    expect(await auth.refresh()).toBe(true);
    const after = await auth.authorization();
    expect(after === before).toBe(false);
    expect(await probe(after)).toEqual({ status: 200, accounts: 1 });
    // Stalwart keeps the old access token valid until it expires.
    expect(await probe(before)).toEqual({ status: 200, accounts: 1 });
    expect(await auth.refresh()).toBe(true);
  });

  it("rejects a wrong password with one request and the `rejected` reason", async () => {
    const auth = newSession();
    const err = await auth.signIn("alice@postern.test", "not-alices-password").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SignInError);
    expect((err as SignInError).reason).toBe("rejected");
    expect(auth.status).toBe("signedOut");
  });

  it("answers an unknown address exactly like a wrong password", async () => {
    const err = await newSession()
      .signIn("nobody@postern.test", "whatever")
      .catch((e: unknown) => e);
    expect((err as SignInError).reason).toBe("rejected");
  });

  it("sign-out forgets the tokens, but Stalwart 0.16.25 cannot revoke them", async () => {
    const auth = newSession();
    await auth.signIn("alice@postern.test", password("alice"));
    const header = await auth.authorization();
    const client = new JmapClient({ baseUrl: BASE, auth });
    await client.connect();

    await auth.signOut();
    const after = await auth.authorization().then(
      () => "resolved",
      (e: unknown) => e,
    );
    expect(after instanceof SignedOutError).toBe(true);
    await expect(client.mailbox.all()).rejects.toBeInstanceOf(SignedOutError);

    // There is no revocation endpoint: a copy taken before sign-out still
    // works until it expires (1 hour). If this ever fails, Stalwart learned to
    // revoke: wire it into AuthSession.signOut and update security.md.
    expect(await probe(header)).toEqual({ status: 200, accounts: 1 });
  });

  it("signs bob in with TOTP, then turns TOTP off again", async () => {
    const bob = "bob@postern.test";
    const basic = basicAuth("bob");
    const basicValue = await basic.authorization();
    // A crashed earlier run could have left TOTP on; Basic then answers 402.
    const start = await probe(basicValue);
    if (start.status !== 200) {
      throw new Error(`bob's Basic auth answers ${start.status}: TOTP is probably still on from an earlier run. Turn it off in the admin UI (dev/README.md).`);
    }
    expect(await otpAuthOf(basic)).toEqual({});

    const { key, url } = newTotpSecret(bob);
    await setAccountPassword(basic, { currentSecret: password("bob"), otpAuth: { otpUrl: url } });
    let auth: AuthSession | undefined;
    try {
      // With TOTP on, plain Basic stops working: app passwords are for IMAP clients.
      expect((await probe(basicValue)).status).toBe(402);

      auth = newSession();
      expect(await auth.signIn(bob, password("bob"))).toBe("mfaRequired");
      await expect(auth.signIn(bob, "not-bobs-password")).rejects.toMatchObject({ reason: "rejected" });
      const wrong = totp(key) === "000000" ? "111111" : "000000";
      await expect(auth.signIn(bob, password("bob"), { mfaToken: wrong })).rejects.toMatchObject({ reason: "rejected" });
      expect(await auth.signIn(bob, password("bob"), { mfaToken: totp(key) })).toBe("signedIn");
      expect(auth.account?.username).toBe(bob);

      const client = new JmapClient({ baseUrl: BASE, auth });
      expect((await client.connect()).username).toBe(bob);
    } finally {
      // Turn it off as bob, with a code: Basic cannot do it while TOTP is on.
      let owner = auth?.status === "active" ? auth : undefined;
      if (!owner) {
        owner = newSession();
        await owner.signIn(bob, password("bob"), { mfaToken: totp(key) });
      }
      await setAccountPassword(owner, { currentSecret: password("bob"), otpAuth: { otpUrl: null, otpCode: totp(key) } });
      // Changing TOTP does not touch the credential version: the session survives.
      expect((await probe(await owner.authorization())).status).toBe(200);
      await owner.signOut();
      if (auth && auth !== owner) await auth.signOut();
    }
    expect(await probe(basicValue)).toEqual({ status: 200, accounts: 1 });
    expect(await otpAuthOf(basic)).toEqual({});
  });
});
