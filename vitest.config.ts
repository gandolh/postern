import { defineConfig } from "vitest/config";

// One Vitest project at the root. Tests sit beside the source (src/) or, for
// the larger JMAP fixtures, in test/ (brief 03).
export default defineConfig({
  test: {
    include: ["*/src/**/*.test.{ts,tsx}", "*/test/**/*.test.{ts,tsx}"],
  },
});
