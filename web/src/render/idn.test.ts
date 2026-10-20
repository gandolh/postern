import { domainToUnicode } from "node:url";
import { describe, expect, it } from "vitest";
import { decodePunycode, hostToUnicode, labelScripts, lookalikeHost } from "./idn";

const host = (raw: string) => new URL(`https://${raw}/`).hostname;

describe("decodePunycode", () => {
  it("decodes what the URL parser encodes, as Node's own decoder does", () => {
    for (const name of ["аррӏе.test", "аpple.test", "раypal.test", "почта.test", "münchen.de", "пример.рф", "例え.jp", "bücher.example", "ελληνικά.gr", "한국.kr"]) {
      const ascii = host(name);
      expect(hostToUnicode(ascii)).toBe(domainToUnicode(ascii));
    }
  });

  it("refuses broken punycode", () => {
    expect(decodePunycode("")).toBeNull();
    expect(decodePunycode("abc!")).toBeNull();
    expect(decodePunycode("zzzzzzzzzzzz")).toBeNull();
    expect(decodePunycode("a".repeat(64))).toBeNull();
  });
});

describe("labelScripts", () => {
  it("leaves digits and hyphens out", () => {
    expect([...labelScripts("abc-123")]).toEqual(["Latin"]);
    expect([...labelScripts("аpple")].sort()).toEqual(["Cyrillic", "Latin"]);
  });
});

describe("lookalikeHost", () => {
  it("flags two scripts in one label", () => {
    expect(lookalikeHost(host("аpple.test"))).toBe("mixed-script");
    expect(lookalikeHost(host("раypal.test"))).toBe("mixed-script");
    expect(lookalikeHost(host("gοogle.com"))).toBe("mixed-script"); // Greek omicron
    expect(lookalikeHost(host("bank-аccount.example"))).toBe("mixed-script");
  });

  it("flags a label whose letters all imitate Latin, under a TLD of another script", () => {
    expect(lookalikeHost(host("аррӏе.test"))).toBe("confusable");
    expect(lookalikeHost(host("асе.com"))).toBe("confusable");
    expect(lookalikeHost(host("ορτ.com"))).toBe("confusable");
  });

  it("does not flag the same letters under their own script's TLD", () => {
    expect(lookalikeHost(host("асе.рф"))).toBeNull();
    expect(lookalikeHost(host("асе.ru"))).toBeNull();
    expect(lookalikeHost(host("ορτ.gr"))).toBeNull();
  });

  it("flags Latin letters made to pass for others", () => {
    expect(lookalikeHost(host("paypaı.com"))).toBe("confusable");
    expect(lookalikeHost(host("ɡoogle.com"))).toBe("confusable");
  });

  it("does not flag ordinary internationalised names", () => {
    for (const name of ["münchen.de", "bücher.example", "почта.test", "пример.рф", "例え.jp", "ドメイン名例.jp", "한국.kr", "ελληνικά.gr", "日本語abc.jp", "中文域名.cn"]) {
      expect(lookalikeHost(host(name)), name).toBeNull();
    }
  });

  it("does not flag plain ASCII hosts", () => {
    for (const name of ["example.com", "sub.evil.test", "localhost", "a-b.c-d.example"]) expect(lookalikeHost(name)).toBeNull();
  });

  it("calls broken punycode unreadable", () => {
    expect(lookalikeHost("xn--zzzzzzzzzzzz.test")).toBe("unreadable");
  });
});
