# Task 01: Scaffold the workspaces

## Context

Postern starts empty. This brief lays down the house layout
([architecture.md](../../wiki/architecture.md)): two packages, `jmap/` and
`web/`, plus the tooling every later brief assumes. Match Satchel
(`../satchel`), the newest estate app, so the owner sees nothing unfamiliar.

## Files you OWN

- `package.json` (root, npm workspaces `jmap`, `web`), `package-lock.json`
- `tsconfig.base.json`, `tsconfig.json`, `eslint.config.js`, `vitest.config.ts`
- `jmap/` (package `@postern/jmap`: `package.json`, `tsconfig.json`,
  `jmap/src/index.ts` with a placeholder export and one test)
- `web/` (package `@postern/web`: `package.json`, `tsconfig.json`,
  `vite.config.ts`, `index.html`, `web/src/main.tsx`, `web/src/App.tsx`)
- `corpus/.planned-roots`: remove `jmap` and `web`

## What to do

1. Pin exactly the versions Satchel uses on 2026-10-09:
   - typescript 6.0.3, vitest 4.1.11, eslint 10.9.1, @eslint/js 10.0.1,
     typescript-eslint 8.69.0, eslint-plugin-react-hooks 7.1.1;
   - @types/node 24.19.1, react and react-dom 19.2.8, @types/react 19.2.18,
     @types/react-dom 19.2.7, @vitejs/plugin-react 6.1.1, vite 8.2.2;
   - `engines.node >=24`.

   Add no other dependencies here. Each later brief adds what it needs.
2. Root scripts: `dev`, `build`, `test` (vitest run), `typecheck`, `lint`,
   `check` (typecheck + lint + test).
3. Vite: `base: "/webmail/"`. A dev-server proxy for `/webmail-api` reads its
   target from `POSTERN_DEV_API` (default `http://127.0.0.1:18080`; brief 02
   publishes there). Production builds to `web/dist`.
4. `web` depends on `@postern/jmap` through the workspace, and `jmap` imports
   nothing from `web`. Lint the direction.
5. The page shows "Postern" and nothing else. No styling yet: that is brief 05.

## Acceptance

- `npm install && npm run check` passes from a clean clone.
- `npm run build` writes `web/dist/index.html` whose asset URLs start with
  `/webmail/`.
- `npm run dev` serves the page at `http://localhost:5173/webmail/`.
- `bash corpus/lint.sh` is clean.

## Outcome (2026-10-20)

Built as specified. `@postern/jmap` builds with `tsc -b` to `jmap/dist` and the
web app resolves it from there, as Satchel's `shared` package does, so `dev`,
`build` and `typecheck` run `tsc -b` first. ESLint's `no-restricted-imports`
keeps `react`, `react-dom` and `@postern/web` out of `jmap/`, and its tsconfig
has no DOM lib. The Vite proxy reads `POSTERN_DEV_API` from the process
environment only. The `.gitignore` from bootstrap gained the browser-test
output folders.
