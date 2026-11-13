import preset from "./vendor/house-style/knip.json" with { type: "json" };

// knip has no `extends`, so this spreads the house preset and adds the entries knip cannot find on its own:
// the scripts, the mail-server setup step (run by dev/setup.sh), the Playwright config and global setup (run with `-c web/e2e`), the Docker-free desk config and specs (`-c web/e2e/desk/desk.config.ts`), and each web feature's
// index, which is its public face and is read by other features only through it.
export default {
  ...preset,
  workspaces: {
    ".": { entry: ["scripts/*.{js,mjs,ts}", "dev/accounts.ts"] },
    web: {
      entry: [
        "e2e/playwright.config.ts",
        "e2e/global-setup.ts",
        "e2e/desk/desk.config.ts",
        "e2e/desk/*.desk.ts",
        "src/*/index.ts",
      ],
    },
  },
};
