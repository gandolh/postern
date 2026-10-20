import { describe, expect, it } from "vitest";
import { forgedAddressInName, readAuthenticationResults, recipientsLine, shortName } from "./people";
import { forwardHeaderText, quoteAttribution, quotePlainText } from "./quoting";

describe("senders", () => {
  it("flags a display name that is a different address", () => {
    expect(forgedAddressInName({ name: "security@bank.example.com", email: "attacker@evil.test" })).toBe("security@bank.example.com");
    expect(forgedAddressInName({ name: '"Support <help@bank.test>"', email: "x@evil.test" })).toBe("help@bank.test");
    expect(forgedAddressInName({ name: "bob@postern.test", email: "Bob@Postern.test" })).toBeNull();
    expect(forgedAddressInName({ name: "Account Support", email: "attacker@evil.test" })).toBeNull();
    expect(forgedAddressInName({ name: null, email: "a@b.test" })).toBeNull();
  });

  it("stays fast on a long hostile display name (brief 17)", () => {
    const start = performance.now();
    expect(forgedAddressInName({ name: "a".repeat(200_000), email: "x@evil.test" })).toBeNull();
    expect(forgedAddressInName({ name: `${"a".repeat(100_000)}@bank`, email: "x@evil.test" })).toBeNull();
    expect(forgedAddressInName({ name: `${"b".repeat(100_000)}@bank.test`, email: "x@evil.test" })).toBe(`${"b".repeat(100_000)}@bank.test`);
    expect(performance.now() - start).toBeLessThan(500);
  });

  it("names recipients the short way, me included", () => {
    expect(recipientsLine([{ name: "Alice Archer", email: "alice@postern.test" }, { name: "Bob Baker", email: "bob@postern.test" }], [{ name: null, email: "carol@x.test" }], "alice@postern.test")).toBe("to me, Bob, carol");
    expect(recipientsLine(null, null, "me@x")).toBe("to undisclosed recipients");
    expect(shortName({ name: "security@bank.example.com", email: "attacker@evil.test" }, "me@x")).toBe("attacker");
  });
});

describe("Authentication-Results", () => {
  it("reads mailed-by and signed-by from the topmost header only", () => {
    const summary = readAuthenticationResults([
      "mail.postern.test; dkim=pass header.d=northwind.example.com; spf=pass smtp.mailfrom=carol@northwind.example.com; dmarc=pass header.from=northwind.example.com",
      "forged.test; dkim=pass header.d=bank.test",
    ]);
    expect(summary).toEqual({
      checkedBy: "mail.postern.test",
      mailedBy: "northwind.example.com",
      signedBy: "northwind.example.com",
      spf: "pass",
      dkim: "pass",
      dmarc: "pass",
    });
  });

  it("names nothing that did not pass", () => {
    const summary = readAuthenticationResults(["mx.test; spf=fail smtp.mailfrom=a@b.test; dkim=none (no signature)"]);
    expect(summary?.mailedBy).toBeNull();
    expect(summary?.signedBy).toBeNull();
    expect(summary?.spf).toBe("fail");
    expect(readAuthenticationResults([])).toBeNull();
  });
});

describe("quoting for replies", () => {
  const message = { from: [{ name: "Bob Baker", email: "bob@postern.test" }], to: [{ name: null, email: "alice@postern.test" }], subject: "Lunch?", sentAt: "2026-10-06T10:05:00Z", receivedAt: "2026-10-06T10:05:00Z" };

  it("attributes and quotes", () => {
    expect(quoteAttribution(message, "en-US")).toMatch(/^On Tue, Oct 6, 2026, \d+:05 [AP]M, Bob Baker <bob@postern\.test> wrote:$/);
    expect(quotePlainText("Hi\n\n> old")).toBe("> Hi\n>\n>> old");
  });

  it("writes the forward header", () => {
    expect(forwardHeaderText(message, "en-US").split("\n")[0]).toBe("---------- Forwarded message ---------");
    expect(forwardHeaderText(message, "en-US")).toContain("From: Bob Baker <bob@postern.test>");
    expect(forwardHeaderText(message, "en-US")).toContain("To: alice@postern.test");
  });
});
