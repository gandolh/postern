import { describe, expect, it } from "vitest";
import { rememberOpened, requestReturnFocus, takeReturnFocus } from "./returnFocus";

const rows = (...ids: string[]) => ids.map((id) => ({ id }));

describe("returnFocus", () => {
  it("does nothing unless a conversation asked", () => {
    rememberOpened("b", 1);
    expect(takeReturnFocus(rows("a", "b", "c"))).toBeNull();
  });

  it("goes back to the row that was opened", () => {
    rememberOpened("b", 1);
    requestReturnFocus(false);
    expect(takeReturnFocus(rows("a", "b", "c"))).toBe("b");
    expect(takeReturnFocus(rows("a", "b", "c"))).toBeNull();
  });

  it("goes to the row that took its place when the conversation left", () => {
    rememberOpened("b", 1);
    requestReturnFocus(true);
    expect(takeReturnFocus(rows("a", "c", "d"))).toBe("c");
    rememberOpened("c", 2);
    requestReturnFocus(true);
    expect(takeReturnFocus(rows("a", "b"))).toBe("b");
  });

  it("skips the row while the list still shows it", () => {
    rememberOpened("b", 1);
    requestReturnFocus(true);
    expect(takeReturnFocus(rows("a", "b", "c"))).toBe("c");
  });

  it("gives up on an empty list", () => {
    rememberOpened("a", 0);
    requestReturnFocus(true);
    expect(takeReturnFocus([])).toBeNull();
  });
});
