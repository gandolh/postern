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
    // Scripts run by hand: the seed and mail-server helpers. They print and read the environment directly.
    scripts: ["dev"],
    // Playwright specs and their support code: test relaxations, and no vitest rules.
    playwright: ["web/e2e/**"],
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
    // The Tailwind entry: the unknown-class, conflicting-class and class-order rules read its theme.
    tailwind: { css: "web/src/styles/index.css", order: true },
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
];
