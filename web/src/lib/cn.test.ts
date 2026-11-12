import { describe, expect, it } from "vitest";
import { cn } from "./cn";

describe("cn", () => {
  it("keeps a named size and a named text colour", () => {
    expect(cn("text-md", "text-text")).toBe("text-md text-text");
    expect(cn("text-text-muted", "text-xs")).toBe("text-text-muted text-xs");
  });

  it("keeps a line height beside a size", () => {
    expect(cn("leading-tight", "text-sm")).toBe("leading-tight text-sm");
  });

  it("lets the later size, radius, shadow or colour win", () => {
    expect(cn("text-sm", "text-lg")).toBe("text-lg");
    expect(cn("rounded-md", "rounded-pill")).toBe("rounded-pill");
    expect(cn("shadow-sm", "shadow-lg")).toBe("shadow-lg");
    expect(cn("text-text", "text-accent")).toBe("text-accent");
  });

  it("drops falsy inputs", () => {
    expect(cn("p-2", false, undefined, "m-1")).toBe("p-2 m-1");
  });
});
