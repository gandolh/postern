import { houseStyle } from "./vendor/house-style/eslint.config.js";

/**
 * The house config from the vendored house-style copy, given Postern's folders. Thin on purpose: the
 * compiler is the first gate, and the house adds only what it cannot see. The rules and the reason for
 * each are in the copy.
 */
export default [
  ...houseStyle({
    root: import.meta.dirname,
    web: "web/src",
    // Scripts run by hand: the seed and mail-server helpers, and the Playwright support code. They print
    // and read the environment directly.
    scripts: ["dev", "web/e2e"],
    // Playwright specs are not vitest files, so the vitest rules stay off them.
    tests: ["**/*.test.{ts,tsx}"],
    // `fast` is the performance tests' own helper around `expect`.
    assertFunctionNames: ["expect", "expectTypeOf", "fast"],
    // projectService looks for the nearest tsconfig.json, and the tests sit in tsconfig.test.json files
    // beside it (jmap/src/**/*.test.ts and jmap/test/** have none), so every project is listed.
    typed: {
      project: [
        "jmap/tsconfig.json",
        "jmap/tsconfig.test.json",
        "web/tsconfig.json",
        "web/tsconfig.test.json",
        "dev/tsconfig.json",
        "web/e2e/tsconfig.json",
      ],
    },
    // Read through `default` by their runner.
    defaultExports: ["web/e2e/global-setup.ts"],
    ignores: ["dev-dist/**", "dev/data/**", "web/e2e/screenshots/**", "test-results/**", "playwright-report/**"],
  }),
  {
    // The JMAP client is plain TypeScript: it never reaches into web, react or the DOM.
    files: ["jmap/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["@postern/web", "@postern/web/*"], message: "jmap must not import from web." },
            { group: ["react", "react-dom", "react/*", "react-dom/*"], message: "jmap must not import React." },
            { group: ["**/web", "**/web/*"], message: "jmap must not reach into web." },
          ],
        },
      ],
    },
  },
  {
    // The live-server helpers read the dev account passwords from the environment, as tests do.
    name: "postern/test-helpers",
    files: ["jmap/test/**", "web/test/**"],
    rules: { "n/no-process-env": "off" },
  },
  {
    // A Playwright spec fails loudly at the line that broke, so `!` is a warning there as in unit tests.
    name: "postern/e2e-specs",
    files: ["web/e2e/**/*.spec.ts"],
    rules: { "@typescript-eslint/no-non-null-assertion": "warn" },
  },
];
