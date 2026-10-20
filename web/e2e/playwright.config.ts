// Postern's browser tests (brief 17): the hostile-mail suite, the CSP and
// headers, and the token checks, in Chromium against the production build
// served by Caddy (Caddyfile) and the dev Stalwart. `npm run test:e2e` builds
// first; README.md in this folder has the rest.
//
// One worker: the specs share alice's mailbox, and opening a conversation
// marks it read (the global setup's teardown puts that back). No traces or
// videos: a trace records what was typed, and the sign-in types a password.

import { defineConfig, devices } from "@playwright/test";
import { ORIGIN } from "./lib/env.ts";

// On a failure Playwright writes the page's accessibility tree to
// test-results/*/error-context.md, input values included: a failure on the
// sign-in page would write the password to disk. This turns that off.
process.env.PLAYWRIGHT_NO_COPY_PROMPT = "1";

export default defineConfig({
  testDir: ".",
  testMatch: "*.spec.ts",
  outputDir: "test-results",
  globalSetup: "./global-setup.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  reporter: [["list"]],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    ...devices["Desktop Chrome"],
    // Full Chromium in its new headless mode, not the headless shell: closer
    // to the browser people use, and it has the PDF viewer the preview needs.
    channel: "chromium",
    baseURL: ORIGIN,
    actionTimeout: 10_000,
    trace: "off",
    video: "off",
    screenshot: "off",
    // Tests that need the worker (csp.spec.ts) turn it back on.
    serviceWorkers: "block",
  },
  projects: [{ name: "chromium" }],
});
