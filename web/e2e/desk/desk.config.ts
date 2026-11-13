// The redesign's browser checks, with no Docker: the built app under `vite preview`, answered by the stub in
// stub.ts. Run: `npx playwright test -c web/e2e/desk/desk.config.ts` (build first). Screenshots: SHOTS_DIR=<dir>.

import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.POSTERN_DESK_PORT ?? 5197);
process.env.PLAYWRIGHT_NO_COPY_PROMPT = "1";

export default defineConfig({
  testDir: ".",
  testMatch: "*.desk.ts",
  outputDir: "../test-results/desk",
  fullyParallel: false,
  workers: 2,
  retries: 0,
  forbidOnly: true,
  reporter: [["list"]],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    ...devices["Desktop Chrome"],
    channel: "chromium",
    baseURL: `http://localhost:${PORT}`,
    trace: "off",
    video: "off",
    serviceWorkers: "block",
  },
  webServer: {
    command: `npx vite preview --port ${PORT} --strictPort`,
    cwd: "../..",
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: false,
    timeout: 30_000,
  },
  projects: [{ name: "chromium" }],
});
