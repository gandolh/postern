import { describe, expect, it } from "vitest";
import { statusMessage } from "./status";

describe("statusMessage", () => {
  it("says nothing while connected or starting", () => {
    expect(statusMessage("open")).toBeNull();
    expect(statusMessage("connecting")).toBeNull();
    expect(statusMessage("closed")).toBeNull();
  });
  it("is quiet about reconnecting and polling", () => {
    expect(statusMessage("reconnecting")).toBe("Reconnecting…");
    expect(statusMessage("polling")).toBe("Checking for mail every 30 seconds");
    expect(statusMessage("polling", 60_000)).toBe("Checking for mail every 60 seconds");
  });
});
