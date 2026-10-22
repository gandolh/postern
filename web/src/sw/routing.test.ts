import { describe, expect, it } from "vitest";
import { isApiPath, mayAnswerFromPrecache, NAVIGATION_DENYLIST, scopePath, servesShell } from "./routing";

// Production's shape since 2026-10-22: the root of Postern's own host, with the
// API inside the scope.
const ORIGIN = "https://postern.example";
const SCOPE = "/";
const url = (path: string, origin = ORIGIN) => new URL(path, origin);

describe("scopePath", () => {
  it("keeps one leading and one trailing slash", () => {
    expect(scopePath("/")).toBe("/");
    expect(scopePath("/webmail/")).toBe("/webmail/");
    expect(scopePath("/webmail")).toBe("/webmail/");
    expect(scopePath("webmail/")).toBe("/webmail/");
  });
});

describe("the API is never routed, though it is inside the scope", () => {
  it.each(["/webmail-api", "/webmail-api/", "/webmail-api/jmap/", "/webmail-api/jmap/session", "/webmail-api/jmap/download/a/b/x.pdf", "/webmail-api/auth/token"])(
    "%s is the API",
    (path) => {
      expect(isApiPath(path)).toBe(true);
      expect(NAVIGATION_DENYLIST.some((re) => re.test(path))).toBe(true);
      expect(servesShell(url(path), ORIGIN, SCOPE)).toBe(false);
      expect(mayAnswerFromPrecache(url(path), ORIGIN, SCOPE)).toBe(false);
    },
  );

  it("does not mistake the app for the API", () => {
    expect(isApiPath("/")).toBe(false);
    expect(isApiPath("/assets/index.js")).toBe(false);
    expect(isApiPath("/webmail-apix")).toBe(false);
  });
});

describe("servesShell (the navigation fallback)", () => {
  it("answers navigations inside the app, whatever the hash", () => {
    expect(servesShell(url("/"), ORIGIN, SCOPE)).toBe(true);
    expect(servesShell(url("/#inbox/T1"), ORIGIN, SCOPE)).toBe(true);
    expect(servesShell(url("/index.html"), ORIGIN, SCOPE)).toBe(true);
    expect(servesShell(url("/webmail-apix"), ORIGIN, SCOPE)).toBe(true);
  });

  it("never answers another origin", () => {
    expect(servesShell(url("/", "https://evil.example"), ORIGIN, SCOPE)).toBe(false);
    expect(servesShell(url("/", "https://example"), ORIGIN, SCOPE)).toBe(false);
  });
});

describe("mayAnswerFromPrecache", () => {
  it("allows the app's own files only", () => {
    expect(mayAnswerFromPrecache(url("/assets/index-abc.js"), ORIGIN, SCOPE)).toBe(true);
    expect(mayAnswerFromPrecache(url("/pwa-192x192.png"), ORIGIN, SCOPE)).toBe(true);
    expect(mayAnswerFromPrecache(url("/assets/x.js", "https://cdn.example"), ORIGIN, SCOPE)).toBe(false);
  });
});

describe("under a sub-path, as before 2026-10-22", () => {
  const SUB = "/webmail/";

  it("answers its own subtree only", () => {
    expect(servesShell(url("/webmail/#inbox/T1"), ORIGIN, SUB)).toBe(true);
    expect(servesShell(url("/"), ORIGIN, SUB)).toBe(false);
    expect(servesShell(url("/atrium/"), ORIGIN, SUB)).toBe(false);
    expect(servesShell(url("/webmailx/"), ORIGIN, SUB)).toBe(false);
    expect(mayAnswerFromPrecache(url("/webmail/assets/index-abc.js"), ORIGIN, SUB)).toBe(true);
    expect(mayAnswerFromPrecache(url("/favicon.ico"), ORIGIN, SUB)).toBe(false);
  });
});
