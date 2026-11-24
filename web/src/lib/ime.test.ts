import { describe, expect, it } from "vitest";
import { isComposingKey } from "./ime";

const press = (isComposing: boolean, keyCode: number) => ({ nativeEvent: { isComposing }, keyCode });

describe("isComposingKey", () => {
  it("is true while the input method composes", () => {
    expect(isComposingKey(press(true, 13))).toBe(true);
  });

  it("is true for keyCode 229, which Safari sends for the Enter that ends a composition", () => {
    expect(isComposingKey(press(false, 229))).toBe(true);
  });

  it("is false for a plain Enter", () => {
    expect(isComposingKey(press(false, 13))).toBe(false);
  });
});
