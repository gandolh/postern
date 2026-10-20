import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["**/dist/**", "**/dev-dist/**", "**/node_modules/**", "dev/data/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["web/src/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
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
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
    },
  },
);
