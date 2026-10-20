// @vitest-environment jsdom
// The sign-in page, the TOTP step, the session-expired dialog, sign-out and the
// idle timeout, against a scripted Stalwart behind /webmail-api.

import type { FetchLike, JmapClient } from "@postern/jmap";
import { SignedOutError } from "@postern/jmap";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SessionProvider, useAccount, useJmap, useSignOut } from "./index";

const PASSWORD = "correct horse battery staple";

const SESSION = {
  capabilities: { "urn:ietf:params:jmap:core": {}, "urn:ietf:params:jmap:mail": {} },
  accounts: { b: { name: "alice@postern.test", isPersonal: true, isReadOnly: false, accountCapabilities: {} } },
  primaryAccounts: { "urn:ietf:params:jmap:mail": "b" },
  username: "alice@postern.test",
  apiUrl: "https://mail.postern.test/jmap/",
  downloadUrl: "https://mail.postern.test/jmap/download/{accountId}/{blobId}/{name}?accept={type}",
  uploadUrl: "https://mail.postern.test/jmap/upload/{accountId}/",
  eventSourceUrl: "https://mail.postern.test/jmap/eventsource/?types={types}&closeafter={closeafter}&ping={ping}",
  state: "s1",
};

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
}

interface Seen {
  key: string;
  body: string | undefined;
  authorization: string | undefined;
}

/** Stalwart's sign-in endpoints and the JMAP session, as Postern reaches them through /webmail-api. */
function fakeStalwart(options: { mfa?: boolean } = {}) {
  const seen: Seen[] = [];
  const queued = new Map<string, (() => Response | Promise<Response>)[]>();
  let issued = 0;
  const fetch: FetchLike = async (input, init = {}) => {
    const url = new URL(input, "http://localhost");
    const key = `${init.method ?? "GET"} ${url.pathname}`;
    const headers = (init.headers ?? {}) as Record<string, string>;
    const body = typeof init.body === "string" ? init.body : undefined;
    seen.push({ key, body, authorization: headers["authorization"] });
    const next = queued.get(key)?.shift();
    if (next) return next();
    switch (key) {
      case "POST /webmail-api/api/auth": {
        const request = JSON.parse(body ?? "{}") as { accountSecret?: string; mfaToken?: string };
        if (request.accountSecret !== PASSWORD) return json({ type: "failure" });
        if (options.mfa && request.mfaToken === undefined) return json({ type: "mfaRequired" });
        if (options.mfa && request.mfaToken !== "123456") return json({ type: "failure" });
        return json({ type: "authenticated", client_code: "CODE", iss: "https://mail.postern.test" });
      }
      case "POST /webmail-api/auth/token":
        issued++;
        return json({ access_token: `A${issued}`, refresh_token: "R1", expires_in: 3600, token_type: "bearer" });
      case "GET /webmail-api/auth/userinfo":
        return json({ sub: "1", name: "Alice Archer", email: "alice@postern.test" });
      case "GET /webmail-api/jmap/session":
        return json(SESSION);
    }
    throw new Error(`fakeStalwart: no route for ${key}`);
  };
  return {
    fetch,
    seen,
    once(key: string, answer: () => Response | Promise<Response>) {
      queued.set(key, [...(queued.get(key) ?? []), answer]);
    },
    signInPosts: () => seen.filter((s) => s.key === "POST /webmail-api/api/auth").map((s) => JSON.parse(s.body ?? "{}") as Record<string, string>),
  };
}

let lastClient: JmapClient | undefined;

function App() {
  const account = useAccount();
  const signOut = useSignOut();
  const client = useJmap();
  useEffect(() => {
    lastClient = client;
  }, [client]);
  const [count, setCount] = useState(0);
  return (
    <main>
      <p>Signed in as {account.username}</p>
      <p>Name: {account.name}</p>
      <button type="button" onClick={() => setCount((c) => c + 1)}>
        Clicked {count}
      </button>
      <button type="button" onClick={() => void signOut()}>
        Sign out
      </button>
    </main>
  );
}

async function signIn(user: ReturnType<typeof userEvent.setup>, password = PASSWORD): Promise<void> {
  await user.type(screen.getByLabelText("Email"), "alice@postern.test");
  await user.type(screen.getByLabelText("Password"), password);
  await user.click(screen.getByRole("button", { name: "Next" }));
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  lastClient = undefined;
});

describe("the sign-in page", () => {
  it("is built for password managers", () => {
    render(<SessionProvider fetch={fakeStalwart().fetch}>{null}</SessionProvider>);
    expect(screen.getByRole("heading", { name: "Sign in" })).toBeTruthy();
    expect(screen.getByLabelText("Email").getAttribute("autocomplete")).toBe("username");
    expect(screen.getByLabelText("Password").getAttribute("autocomplete")).toBe("current-password");
    // A submit that skipped onSubmit must never put the password in a GET URL.
    expect(screen.getByLabelText("Password").closest("form")?.getAttribute("method")).toBe("post");
  });

  it("signs in with email and password, and keeps nothing in storage", async () => {
    const server = fakeStalwart();
    const user = userEvent.setup();
    render(
      <SessionProvider fetch={server.fetch}>
        <App />
      </SessionProvider>,
    );
    await signIn(user);
    expect(await screen.findByText("Signed in as alice@postern.test")).toBeTruthy();
    expect(screen.getByText("Name: Alice Archer")).toBeTruthy();
    expect(server.signInPosts()).toHaveLength(1);
    expect(server.signInPosts()[0]).toMatchObject({ accountName: "alice@postern.test", clientId: "postern", redirectUri: new URL(import.meta.env.BASE_URL, window.location.origin).href });
    expect(lastClient?.session.username).toBe("alice@postern.test");
    expect(server.seen.find((s) => s.key === "GET /webmail-api/jmap/session")?.authorization).toBe("Bearer A1");
    expect(document.body.innerHTML).not.toContain(PASSWORD);
    expect(localStorage.length + sessionStorage.length).toBe(0);
    expect(document.cookie).toBe("");
  });

  it("says a wrong password is wrong, empties the field and never retries", async () => {
    const server = fakeStalwart();
    const user = userEvent.setup();
    render(
      <SessionProvider fetch={server.fetch}>
        <App />
      </SessionProvider>,
    );
    await signIn(user, "wrong password");
    expect((await screen.findByRole("alert")).textContent).toMatch(/^Wrong email or password\. Try again\./);
    expect((screen.getByLabelText("Password") as HTMLInputElement).value).toBe("");
    await new Promise((r) => setTimeout(r, 100));
    expect(server.signInPosts()).toHaveLength(1);
  });

  it("asks for the TOTP code when the account has 2-step verification", async () => {
    const server = fakeStalwart({ mfa: true });
    const user = userEvent.setup();
    render(
      <SessionProvider fetch={server.fetch}>
        <App />
      </SessionProvider>,
    );
    await signIn(user);
    expect(await screen.findByRole("heading", { name: "2-step verification" })).toBeTruthy();
    const code = screen.getByLabelText("Enter the code");
    expect(code.getAttribute("autocomplete")).toBe("one-time-code");
    expect(code.getAttribute("inputmode")).toBe("numeric");
    expect(code.closest("form")?.getAttribute("method")).toBe("post");

    await user.type(code, "654321");
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Wrong code. Try again.");

    await user.type(screen.getByLabelText("Enter the code"), "123456");
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByText("Signed in as alice@postern.test")).toBeTruthy();
    expect(server.signInPosts().map((p) => [p["accountSecret"] === PASSWORD, p["mfaToken"]])).toEqual([
      [true, undefined],
      [true, "654321"],
      [true, "123456"],
    ]);
  });

  it.each([
    ["rate limit", () => new Response("", { status: 429 }), /^Too many attempts/],
    ["ban", () => json({ type: "about:blank", status: 403 }, 403), /blocked for a while/],
    ["network", () => Promise.reject(new TypeError("fetch failed")), /^Can't reach the mail server/],
    ["server error", () => new Response("", { status: 502 }), /^The mail server couldn't sign you in/],
  ] as const)("explains a %s", async (_name, answer, message) => {
    const server = fakeStalwart();
    server.once("POST /webmail-api/api/auth", answer);
    const user = userEvent.setup();
    render(
      <SessionProvider fetch={server.fetch}>
        <App />
      </SessionProvider>,
    );
    await signIn(user);
    expect((await screen.findByRole("alert")).textContent).toMatch(message);
    // Only a rejection empties the password.
    expect((screen.getByLabelText("Password") as HTMLInputElement).value).toBe(PASSWORD);
  });
});

describe("the signed-in session", () => {
  it("shows the session-expired dialog over the app, and signing in again keeps the app's state", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const server = fakeStalwart();
    const user = userEvent.setup();
    render(
      <SessionProvider fetch={server.fetch}>
        <App />
      </SessionProvider>,
    );
    await signIn(user);
    await screen.findByText("Signed in as alice@postern.test");
    await user.click(screen.getByRole("button", { name: "Clicked 0" }));
    await user.click(screen.getByRole("button", { name: "Clicked 1" }));

    // The access token has expired and Stalwart refuses the refresh token.
    vi.setSystemTime(Date.now() + 61 * 60_000);
    server.once("POST /webmail-api/auth/token", () => json({ error: "invalid_grant" }, 400));
    await act(async () => {
      await lastClient?.connect().catch(() => undefined);
    });

    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toContain("Your session expired");
    expect(dialog.textContent).toContain("alice@postern.test");
    expect(screen.getByRole("button", { name: "Clicked 2" })).toBeTruthy();

    // It cannot be dismissed: Escape is cancelled, the browser's close requests are refused,
    // and a close that gets through anyway (Chrome's second Escape) reopens it.
    const modal = dialog as HTMLDialogElement;
    expect(modal.getAttribute("closedby")).toBe("none");
    const escape = new Event("cancel", { cancelable: true });
    act(() => {
      modal.dispatchEvent(escape);
    });
    expect(escape.defaultPrevented).toBe(true);
    act(() => {
      if (typeof modal.close === "function") modal.close();
      else modal.removeAttribute("open");
      modal.dispatchEvent(new Event("close"));
    });
    await waitFor(() => expect(modal.hasAttribute("open")).toBe(true));
    expect(screen.getByRole("dialog")).toBe(modal);

    await user.type(screen.getByLabelText("Password"), PASSWORD);
    await user.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByRole("button", { name: "Clicked 2" })).toBeTruthy();
    expect(server.signInPosts().at(-1)?.["accountName"]).toBe("alice@postern.test");
    await act(async () => {
      await lastClient?.connect();
    });
    expect(server.seen.filter((s) => s.key === "GET /webmail-api/jmap/session").at(-1)?.authorization).toBe("Bearer A2");
  });

  it("signs out: back to the sign-in page, and the old client no longer works", async () => {
    const server = fakeStalwart();
    const user = userEvent.setup();
    render(
      <SessionProvider fetch={server.fetch}>
        <App />
      </SessionProvider>,
    );
    await signIn(user);
    await screen.findByText("Signed in as alice@postern.test");
    const client = lastClient;
    await user.click(screen.getByRole("button", { name: "Sign out" }));
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeTruthy();
    expect(screen.queryByText(/Signed in as/)).toBeNull();
    await expect(client?.connect()).rejects.toBeInstanceOf(SignedOutError);
  });

  it("signs out when the tab becomes visible after the machine slept past the idle deadline", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const server = fakeStalwart();
    const user = userEvent.setup();
    render(
      <SessionProvider fetch={server.fetch}>
        <App />
      </SessionProvider>,
    );
    await signIn(user);
    await screen.findByText("Signed in as alice@postern.test");
    vi.setSystemTime(Date.now() + 9 * 60 * 60_000);
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect((await screen.findByRole("status")).textContent).toMatch(/signed out after a long time without activity/);
    expect(screen.queryByText(/Signed in as/)).toBeNull();
  });

  it("signs out on the first key press after the machine slept past the idle deadline", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const server = fakeStalwart();
    const user = userEvent.setup();
    render(
      <SessionProvider fetch={server.fetch}>
        <App />
      </SessionProvider>,
    );
    await signIn(user);
    await screen.findByText("Signed in as alice@postern.test");
    vi.setSystemTime(Date.now() + 9 * 60 * 60_000);
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "j" }));
    });
    expect((await screen.findByRole("status")).textContent).toMatch(/signed out after a long time without activity/);
  });

  it("signs out after the idle timeout, and input keeps the session alive", async () => {
    const server = fakeStalwart();
    const user = userEvent.setup();
    render(
      <SessionProvider fetch={server.fetch} idleTimeoutMs={400}>
        <App />
      </SessionProvider>,
    );
    await signIn(user);
    await screen.findByText("Signed in as alice@postern.test");
    for (let i = 0; i < 8; i++) {
      await new Promise((r) => setTimeout(r, 100));
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "j" }));
    }
    expect(screen.getByText("Signed in as alice@postern.test")).toBeTruthy();
    expect((await screen.findByRole("status", {}, { timeout: 2000 })).textContent).toMatch(/signed out after a long time without activity/);
    expect(screen.getByRole("heading", { name: "Sign in" })).toBeTruthy();
  });
});
