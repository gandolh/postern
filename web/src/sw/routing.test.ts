import { describe, expect, it } from "vitest";
import { isApiPath, mayAnswerFromPrecache, NAVIGATION_DENYLIST, scopePath, servesShell } from "./routing";

const ORIGIN = "https://estate.example";
const SCOPE = "/webmail/";
const url = (path: string, origin = ORIGIN) => new URL(path, origin);

describe("scopePath", () => {
  it("keeps one leading and one trailing slash", () => {
    expect(scopePath("/webmail/")).toBe("/webmail/");
    expect(scopePath("/webmail")).toBe("/webmail/");
    expect(scopePath("webmail/")).toBe("/webmail/");
  });
});

describe("the API is never routed", () => {
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
    expect(isApiPath("/webmail/")).toBe(false);
    expect(isApiPath("/webmail/assets/index.js")).toBe(false);
    expect(isApiPath("/webmail-apix")).toBe(false);
  });
});

describe("servesShell (the navigation fallback)", () => {
  it("answers navigations inside the app, whatever the hash", () => {
    expect(servesShell(url("/webmail/"), ORIGIN, SCOPE)).toBe(true);
    expect(servesShell(url("/webmail/#inbox/T1"), ORIGIN, SCOPE)).toBe(true);
    expect(servesShell(url("/webmail/index.html"), ORIGIN, SCOPE)).toBe(true);
  });

  it("never answers another estate app or another origin", () => {
    expect(servesShell(url("/"), ORIGIN, SCOPE)).toBe(false);
    expect(servesShell(url("/atrium/"), ORIGIN, SCOPE)).toBe(false);
    expect(servesShell(url("/webmailx/"), ORIGIN, SCOPE)).toBe(false);
    expect(servesShell(url("/webmail/", "https://evil.example"), ORIGIN, SCOPE)).toBe(false);
  });
});

describe("mayAnswerFromPrecache", () => {
  it("allows the app's own files only", () => {
    expect(mayAnswerFromPrecache(url("/webmail/assets/index-abc.js"), ORIGIN, SCOPE)).toBe(true);
    expect(mayAnswerFromPrecache(url("/webmail/pwa-192x192.png"), ORIGIN, SCOPE)).toBe(true);
    expect(mayAnswerFromPrecache(url("/favicon.ico"), ORIGIN, SCOPE)).toBe(false);
    expect(mayAnswerFromPrecache(url("/webmail/assets/x.js", "https://cdn.example"), ORIGIN, SCOPE)).toBe(false);
  });
});
