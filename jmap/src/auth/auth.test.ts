// Unit tests for sign-in, the token holder, refresh, expiry, sign-out and the
// idle timeout, against a scripted Stalwart.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeServer, SESSION, json, type Recorded } from "../../test/unit/helpers.js";
import { JmapClient, JmapNetworkError, JmapUnauthorizedError } from "../index.js";
import {
  AuthSession,
  IDLE_TIMEOUT_MS,
  IdleTimeout,
  SessionExpiredError,
  SignInError,
  SignedOutError,
  createPkce,
  pkceChallenge,
  requestAuthCode,
  type AuthStatusEvent,
} from "./index.js";
import { base64Url } from "./pkce.js";

const BASE = "http://127.0.0.1:18080";
const REDIRECT = "http://localhost:5173/webmail/";
const PASSWORD = "correct horse battery staple";

type Grant = { access_token: string; refresh_token?: string; expires_in: number };

function form(req: Recorded): Record<string, string> {
  return Object.fromEntries(new URLSearchParams(req.body ?? ""));
}

/** A FakeServer playing Stalwart's sign-in endpoints. */
function stalwart(options: { mfa?: boolean; sub?: string } = {}) {
  const server = new FakeServer();
  let issued = 0;
  server.always("POST /api/auth", (req) => {
    const body = req.json as { accountSecret: string; mfaToken?: string };
    if (body.accountSecret !== PASSWORD) return json({ type: "failure" });
    if (options.mfa && body.mfaToken === undefined) return json({ type: "mfaRequired" });
    if (options.mfa && body.mfaToken !== "123456") return json({ type: "failure" });
    return json({ type: "authenticated", client_code: "CODE", iss: "https://mail.postern.test" });
  });
  server.always("POST /auth/token", (req) => {
    const params = form(req);
    issued++;
    if (params["grant_type"] === "authorization_code") {
      return json({ access_token: `A${issued}`, refresh_token: "R1", expires_in: 3600, token_type: "bearer", id_token: "ID" });
    }
    return json({ access_token: `A${issued}`, expires_in: 3600, token_type: "bearer" } satisfies Grant & { token_type: string });
  });
  server.always("GET /auth/userinfo", () =>
    json({ sub: options.sub ?? "1", name: "Alice Archer", preferred_username: "alice@postern.test", email: "alice@postern.test" }),
  );
  return server;
}

function session(server: FakeServer, extra: Partial<ConstructorParameters<typeof AuthSession>[0]> = {}): AuthSession {
  return new AuthSession({ baseUrl: BASE, redirectUri: REDIRECT, fetch: server.fetch, ...extra });
}

const tokenRequests = (server: FakeServer) => server.requests.filter((r) => r.url.endsWith("/auth/token"));
const refreshes = (server: FakeServer) => tokenRequests(server).filter((r) => form(r)["grant_type"] === "refresh_token");

describe("PKCE", () => {
  it("matches RFC 7636 appendix B", async () => {
    const octets = [116, 24, 223, 180, 151, 153, 224, 37, 79, 250, 96, 125, 216, 173, 187, 186, 22, 212, 37, 77, 105, 214, 191, 240, 91, 88, 5, 88, 83, 132, 141, 121];
    const verifier = base64Url(new Uint8Array(octets));
    expect(verifier).toBe("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk");
    expect(await pkceChallenge(verifier)).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });

  it("makes a 43-character unreserved verifier and its S256 challenge", async () => {
    const a = await createPkce();
    const b = await createPkce();
    expect(a.verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a.verifier).not.toBe(b.verifier);
    expect(a.challenge).toBe(await pkceChallenge(a.verifier));
  });
});

describe("requestAuthCode", () => {
  const request = { accountName: "alice@postern.test", accountSecret: PASSWORD, clientId: "postern", redirectUri: REDIRECT, codeChallenge: "C" };

  it("posts Stalwart's authCode body and reads the snake-case code", async () => {
    const server = stalwart();
    expect(await requestAuthCode(server.fetch, BASE, request)).toEqual({ type: "authenticated", code: "CODE" });
    const [req] = server.requests;
    expect(req?.url).toBe(`${BASE}/api/auth`);
    expect(req?.headers["content-type"]).toBe("application/json");
    expect(req?.json).toEqual({
      type: "authCode",
      accountName: "alice@postern.test",
      accountSecret: PASSWORD,
      clientId: "postern",
      redirectUri: REDIRECT,
      codeChallenge: "C",
      codeChallengeMethod: "S256",
    });
  });

  it.each([
    [json({ type: "failure" }), "rejected"],
    [new Response("", { status: 429, headers: { "retry-after": "30" } }), "rateLimited"],
    [json({ type: "about:blank", status: 403 }, 403, "application/problem+json"), "blocked"],
    [json({ type: "about:blank", status: 401 }, 401, "application/problem+json"), "server"],
    [new Response("<html>", { status: 502 }), "server"],
    [json({ type: "somethingElse" }), "server"],
  ])("maps %# to %s", async (response, reason) => {
    const server = new FakeServer().once("POST /api/auth", () => response);
    const err = await requestAuthCode(server.fetch, BASE, request).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SignInError);
    expect((err as SignInError).reason).toBe(reason);
    if (reason === "rateLimited") expect((err as SignInError).retryAfter).toBe(30);
  });

  it("maps a fetch failure to network", async () => {
    const err = await requestAuthCode(() => Promise.reject(new TypeError("fetch failed")), BASE, request).catch((e: unknown) => e);
    expect((err as SignInError).reason).toBe("network");
  });
});

describe("AuthSession: signing in", () => {
  it("signs in with PKCE, exchanges the code and loads the account", async () => {
    const server = stalwart();
    const auth = session(server);
    const events: AuthStatusEvent[] = [];
    auth.onStatus((e) => events.push(e));

    expect(await auth.signIn(" alice@postern.test ", PASSWORD)).toBe("signedIn");
    expect(auth.status).toBe("active");
    expect(auth.account).toEqual({ id: "1", username: "alice@postern.test", name: "Alice Archer" });
    expect(events).toEqual([{ status: "active" }]);
    expect(await auth.authorization()).toBe("Bearer A1");

    const [login, token, userinfo] = server.requests;
    const challenge = (login?.json as { codeChallenge: string; accountName: string }).codeChallenge;
    expect((login?.json as { accountName: string }).accountName).toBe("alice@postern.test");
    const params = form(token!);
    expect(params).toMatchObject({ grant_type: "authorization_code", code: "CODE", client_id: "postern", redirect_uri: REDIRECT });
    expect(await pkceChallenge(params["code_verifier"]!)).toBe(challenge);
    expect(userinfo?.headers["authorization"]).toBe("Bearer A1");
    await auth.signOut();
  });

  it("asks for the TOTP code, then retries with it", async () => {
    const server = stalwart({ mfa: true });
    const auth = session(server);
    expect(await auth.signIn("alice@postern.test", PASSWORD)).toBe("mfaRequired");
    expect(auth.status).toBe("signedOut");
    await expect(auth.signIn("alice@postern.test", PASSWORD, { mfaToken: "000000" })).rejects.toMatchObject({ reason: "rejected" });
    expect(await auth.signIn("alice@postern.test", PASSWORD, { mfaToken: " 123456 " })).toBe("signedIn");
    const posts = server.requests.filter((r) => r.url.endsWith("/api/auth")).map((r) => (r.json as { mfaToken?: string }).mfaToken);
    expect(posts).toEqual([undefined, "000000", "123456"]);
    await auth.signOut();
  });

  it("makes one attempt per call: a wrong password is never retried", async () => {
    const server = stalwart();
    const auth = session(server);
    const err = await auth.signIn("alice@postern.test", "wrong").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SignInError);
    expect((err as SignInError).reason).toBe("rejected");
    expect(server.requests).toHaveLength(1);
    expect(auth.status).toBe("signedOut");
    await expect(auth.authorization()).rejects.toBeInstanceOf(SignedOutError);
  });

  it("keeps secrets out of error messages", async () => {
    const server = stalwart();
    const auth = session(server);
    const errors: unknown[] = [];
    await auth.signIn("alice@postern.test", "hunter2-secret").catch((e: unknown) => errors.push(e));
    await auth.signIn("alice@postern.test", PASSWORD);
    server.once("POST /auth/token", () => json({ error: "invalid_grant" }, 400));
    expect(await auth.refresh()).toBe(false);
    await auth.authorization().catch((e: unknown) => errors.push(e));
    expect(errors).toHaveLength(2);
    for (const e of errors) {
      const text = `${String(e)} ${JSON.stringify(e)} ${(e as Error).stack ?? ""}`;
      for (const secret of ["hunter2-secret", PASSWORD, "A1", "R1", "CODE"]) expect(text).not.toContain(secret);
    }
    await auth.signOut();
  });
});

describe("AuthSession: refresh", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("refreshes five minutes before expiry and keeps the refresh token", async () => {
    const server = stalwart();
    const auth = session(server);
    await auth.signIn("alice@postern.test", PASSWORD);
    await vi.advanceTimersByTimeAsync(54 * 60_000);
    expect(refreshes(server)).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(refreshes(server)).toHaveLength(1);
    expect(form(refreshes(server)[0]!)).toEqual({ grant_type: "refresh_token", refresh_token: "R1", client_id: "postern" });
    expect(await auth.authorization()).toBe("Bearer A2");
    await vi.advanceTimersByTimeAsync(55 * 60_000);
    expect(refreshes(server).map((r) => form(r)["refresh_token"])).toEqual(["R1", "R1"]);
    await auth.signOut();
  });

  it("uses a renewed refresh token when Stalwart sends one", async () => {
    const server = stalwart();
    const auth = session(server);
    await auth.signIn("alice@postern.test", PASSWORD);
    server.once("POST /auth/token", () => json({ access_token: "A9", refresh_token: "R2", expires_in: 3600 }));
    expect(await auth.refresh()).toBe(true);
    expect(await auth.refresh()).toBe(true);
    expect(refreshes(server).map((r) => form(r)["refresh_token"])).toEqual(["R1", "R2"]);
    await auth.signOut();
  });

  it("shares one refresh between concurrent callers", async () => {
    const server = stalwart();
    const auth = session(server);
    await auth.signIn("alice@postern.test", PASSWORD);
    vi.setSystemTime(Date.now() + 60 * 60_000); // the access token has expired
    const results = await Promise.all([auth.authorization(), auth.authorization(), auth.refresh(), auth.onUnauthorized()]);
    expect(refreshes(server)).toHaveLength(1);
    expect(results).toEqual(["Bearer A2", "Bearer A2", true, true]);
    await auth.signOut();
  });

  it("retries a request once after a 401, with a fresh token", async () => {
    const server = stalwart();
    const auth = session(server);
    await auth.signIn("alice@postern.test", PASSWORD);
    await vi.advanceTimersByTimeAsync(10_000);
    server.once("GET /jmap/session", () => json({ type: "about:blank", status: 401 }, 401, "application/problem+json"));
    server.once("GET /jmap/session", () => json(SESSION));
    const client = new JmapClient({ baseUrl: BASE, auth, fetch: server.fetch });
    await client.connect();
    const sessions = server.requests.filter((r) => r.url.endsWith("/jmap/session")).map((r) => r.headers["authorization"]);
    expect(sessions).toEqual(["Bearer A1", "Bearer A2"]);
    await auth.signOut();
  });

  it("expires the session when a refresh is refused, and keeps the account for signing in again", async () => {
    const server = stalwart();
    const auth = session(server);
    const events: string[] = [];
    auth.onStatus((e) => events.push(e.status));
    await auth.signIn("alice@postern.test", PASSWORD);
    await vi.advanceTimersByTimeAsync(10_000);
    server.once("POST /auth/token", () => json({ error: "invalid_grant" }, 400));
    expect(await auth.onUnauthorized()).toBe(false);
    expect(auth.status).toBe("expired");
    expect(events).toEqual(["active", "expired"]);
    expect(auth.account?.username).toBe("alice@postern.test");
    await expect(auth.authorization()).rejects.toBeInstanceOf(SessionExpiredError);
    await expect(auth.authorization()).rejects.toBeInstanceOf(JmapUnauthorizedError);
    expect(vi.getTimerCount()).toBe(1); // only the idle timeout

    // Signing in again restores the same holder, so a client built on it keeps working.
    expect(await auth.signIn("alice@postern.test", PASSWORD)).toBe("signedIn");
    expect(auth.status).toBe("active");
    expect(events).toEqual(["active", "expired", "active"]);
    expect(await auth.authorization()).toMatch(/^Bearer A\d$/);
    await auth.signOut();
  });

  it("will not sign in again as a different account", async () => {
    const server = stalwart();
    const auth = session(server);
    await auth.signIn("alice@postern.test", PASSWORD);
    server.once("POST /auth/token", () => json({ error: "invalid_grant" }, 400));
    await auth.refresh();
    server.always("GET /auth/userinfo", () => json({ sub: "2", email: "bob@postern.test" }));
    await expect(auth.signIn("bob@postern.test", PASSWORD)).rejects.toMatchObject({ reason: "rejected" });
    expect(auth.status).toBe("expired");
    expect(auth.account?.username).toBe("alice@postern.test");
    await auth.signOut();
  });

  it("keeps the tokens through a network failure and tries again", async () => {
    const server = stalwart();
    const auth = session(server);
    await auth.signIn("alice@postern.test", PASSWORD);
    server.once("POST /auth/token", () => Promise.reject(new TypeError("fetch failed")));
    expect(await auth.refresh()).toBe(false);
    expect(auth.status).toBe("active");
    expect(await auth.authorization()).toBe("Bearer A1");
    await vi.advanceTimersByTimeAsync(5_000);
    expect(refreshes(server)).toHaveLength(2);
    expect(await auth.authorization()).toBe("Bearer A2");
    await auth.signOut();
  });

  it("fails a request with a network error when the token has expired and the server is unreachable", async () => {
    const server = stalwart();
    const auth = session(server);
    await auth.signIn("alice@postern.test", PASSWORD);
    vi.setSystemTime(Date.now() + 61 * 60_000);
    server.once("POST /auth/token", () => Promise.reject(new TypeError("fetch failed")));
    await expect(auth.authorization()).rejects.toBeInstanceOf(JmapNetworkError);
    expect(auth.status).toBe("active");
    await auth.signOut();
  });
});

describe("AuthSession: signing out", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("forgets the tokens and the account, and stops every timer", async () => {
    const server = stalwart();
    const auth = session(server);
    const events: AuthStatusEvent[] = [];
    auth.onStatus((e) => events.push(e));
    await auth.signIn("alice@postern.test", PASSWORD);
    expect(vi.getTimerCount()).toBe(2); // refresh + idle
    await auth.signOut();
    expect(auth.status).toBe("signedOut");
    expect(auth.account).toBeUndefined();
    expect(events.at(-1)).toEqual({ status: "signedOut", reason: "user" });
    expect(vi.getTimerCount()).toBe(0);
    await expect(auth.authorization()).rejects.toBeInstanceOf(SignedOutError);
    expect(await auth.onUnauthorized()).toBe(false);
    expect(await auth.refresh()).toBe(false);
    const before = server.requests.length;
    await vi.advanceTimersByTimeAsync(2 * 60 * 60_000);
    expect(server.requests).toHaveLength(before);
  });

  it("drops a refresh answer that arrives after sign-out", async () => {
    const server = stalwart();
    const auth = session(server);
    await auth.signIn("alice@postern.test", PASSWORD);
    let release!: () => void;
    server.once("POST /auth/token", () => new Promise<Response>((resolve) => (release = () => resolve(json({ access_token: "LATE", expires_in: 3600 })))));
    const pending = auth.refresh();
    await vi.advanceTimersByTimeAsync(0);
    await auth.signOut();
    release();
    expect(await pending).toBe(false);
    await expect(auth.authorization()).rejects.toBeInstanceOf(SignedOutError);
  });

  it("signs out after the idle timeout, and activity postpones it", async () => {
    const server = stalwart();
    const auth = session(server);
    const events: AuthStatusEvent[] = [];
    auth.onStatus((e) => events.push(e));
    await auth.signIn("alice@postern.test", PASSWORD);
    await vi.advanceTimersByTimeAsync(IDLE_TIMEOUT_MS - 60_000);
    auth.noteActivity();
    await vi.advanceTimersByTimeAsync(IDLE_TIMEOUT_MS - 60_000);
    expect(auth.status).toBe("active");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(auth.status).toBe("signedOut");
    expect(events.at(-1)).toEqual({ status: "signedOut", reason: "idle" });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("signs out on the next request when the machine slept through the idle deadline", async () => {
    const server = stalwart();
    const auth = session(server, { idleTimeoutMs: 60 * 60_000 });
    await auth.signIn("alice@postern.test", PASSWORD);
    vi.setSystemTime(Date.now() + 2 * 60 * 60_000); // no timer has fired yet
    await expect(auth.authorization()).rejects.toBeInstanceOf(SignedOutError);
    expect(auth.status).toBe("signedOut");
  });
});

describe("IdleTimeout", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("fires once after the period without activity", () => {
    const onIdle = vi.fn();
    const idle = new IdleTimeout({ timeoutMs: 1000, onIdle });
    idle.start();
    vi.advanceTimersByTime(600);
    idle.activity();
    vi.advanceTimersByTime(600);
    expect(onIdle).not.toHaveBeenCalled();
    expect(idle.expired()).toBe(false);
    vi.advanceTimersByTime(400);
    expect(onIdle).toHaveBeenCalledOnce();
    expect(idle.running).toBe(false);
    vi.advanceTimersByTime(5000);
    expect(onIdle).toHaveBeenCalledOnce();
  });

  it("can be turned off", () => {
    const onIdle = vi.fn();
    const idle = new IdleTimeout({ timeoutMs: Infinity, onIdle });
    idle.start();
    vi.advanceTimersByTime(10 * IDLE_TIMEOUT_MS);
    expect(onIdle).not.toHaveBeenCalled();
    expect(idle.expired()).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("security review fixes", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("IdleTimeout: the first input after sleeping past the deadline ends the session instead of restarting the clock", () => {
    const onIdle = vi.fn();
    const idle = new IdleTimeout({ timeoutMs: 1000, onIdle });
    idle.start();
    expect(idle.check()).toBe(false);
    vi.setSystemTime(Date.now() + 5000); // asleep: no timer has fired
    idle.activity();
    expect(onIdle).toHaveBeenCalledOnce();
    expect(idle.running).toBe(false);
    idle.activity();
    expect(idle.check()).toBe(false);
    expect(onIdle).toHaveBeenCalledOnce();
  });

  it("AuthSession: sleep, then a key press, signs out with reason idle", async () => {
    const server = stalwart();
    const auth = session(server);
    const events: AuthStatusEvent[] = [];
    auth.onStatus((e) => events.push(e));
    await auth.signIn("alice@postern.test", PASSWORD);
    vi.setSystemTime(Date.now() + IDLE_TIMEOUT_MS + 60_000);
    auth.noteActivity();
    expect(auth.status).toBe("signedOut");
    expect(events.at(-1)).toEqual({ status: "signedOut", reason: "idle" });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("AuthSession: checkIdle() signs out after sleep without counting as activity", async () => {
    const server = stalwart();
    const auth = session(server);
    await auth.signIn("alice@postern.test", PASSWORD);
    vi.setSystemTime(Date.now() + IDLE_TIMEOUT_MS - 60_000);
    expect(auth.checkIdle()).toBe(false);
    vi.setSystemTime(Date.now() + 120_000);
    expect(auth.checkIdle()).toBe(true);
    expect(auth.status).toBe("signedOut");
  });

  it("AuthSession: signing in again after the idle deadline passed is refused", async () => {
    const server = stalwart();
    const auth = session(server);
    await auth.signIn("alice@postern.test", PASSWORD);
    server.once("POST /auth/token", () => json({ error: "invalid_grant" }, 400));
    await auth.refresh();
    expect(auth.status).toBe("expired");
    vi.setSystemTime(Date.now() + IDLE_TIMEOUT_MS + 60_000);
    const before = server.requests.length;
    await expect(auth.signIn("alice@postern.test", PASSWORD)).rejects.toBeInstanceOf(SignedOutError);
    expect(auth.status).toBe("signedOut");
    expect(server.requests).toHaveLength(before);
  });

  it("AuthSession: signOut() cancels a first sign-in still in flight", async () => {
    const server = stalwart();
    const auth = session(server);
    let release!: () => void;
    server.once(
      "POST /api/auth",
      () => new Promise<Response>((resolve) => (release = () => resolve(json({ type: "authenticated", client_code: "CODE", iss: "x" })))),
    );
    const pending = auth.signIn("alice@postern.test", PASSWORD).catch((e: unknown) => e);
    await vi.waitFor(() => expect(server.requests).toHaveLength(1));
    await auth.signOut();
    release();
    expect(await pending).toBeInstanceOf(SignedOutError);
    expect(auth.status).toBe("signedOut");
    expect(auth.account).toBeUndefined();
    expect(tokenRequests(server)).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
    await expect(auth.authorization()).rejects.toBeInstanceOf(SignedOutError);
  });
});
