import { describe, expect, it } from "vitest";
import { PACKAGE_NAME } from "./index.js";

describe("@postern/jmap", () => {
  it("exports its package name", () => {
    expect(PACKAGE_NAME).toBe("@postern/jmap");
  });
});
