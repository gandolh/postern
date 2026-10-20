import { defineConfig } from "vitest/config";

// Tests sit beside the source (src/) or, for the larger JMAP fixtures, in
// test/ (brief 03). Integration tests share one dev Stalwart and one set of
// accounts, and some flip account state for a moment (brief 04 turns TOTP on
// for bob), so their files run one at a time.
export default defineConfig({
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["*/src/**/*.test.{ts,tsx}", "*/test/unit/**/*.test.{ts,tsx}"],
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          include: ["*/test/integration/**/*.test.{ts,tsx}"],
          fileParallelism: false,
        },
      },
    ],
  },
});
