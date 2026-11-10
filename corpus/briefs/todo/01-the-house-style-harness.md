# Task 01: The house style and the quality harness

**Depends on:**

- In Postern: nothing. This brief runs first.
- In the owner's skills library:
  - brief 27, *A house style, and a quality harness that enforces it*: the `house-style` package at `v1.0.0`, the `house-style` skill, and the plugin's `Stop` and `PostToolUse` hooks;
  - brief 15, *Enforce the base-ui and code-structure skills in every repo*: how the convention checker is wired and when it runs `--warn-only`.
- The owner's grilling of 2026-11-10, questions Q5-Q14 of the skills library's open questions, plus the new questions in the decisions below.

**Runs before:** 02 and 03. The reformat touches most of the 342 TypeScript files, and those two briefs rewrite most of the web ones. Formatting first gives one clean reformat commit, and the formatter hook keeps every later diff formatted.

**Before you start:** run `brief-board guide` ([corpus/CLAUDE.md](../../CLAUDE.md)).

## Context

On 2026-11-09 the owner made three calls for every web app they own: Base UI 1.9.0 everywhere, the whole app on Tailwind v4, and the researched conventions enforced in each repo. The skills library's brief 27 measured the house style and found it consistent but unenforced. Its answer is a two-layer harness:

- **The repo's gate:** `npm run check` and its fast subset `npm run check:fast`. They hold for a human, any agent and the deploy.
- **The Claude Code layer:**
  - the plugin's `Stop` hook runs `check:fast` and exits 2 on a failure;
  - its `PostToolUse` hook formats each saved file;
  - `.claude/rules/web.md` and `.claude/rules/jmap.md` are scoped by `paths:`;
  - a short root `CLAUDE.md` holds the commands.

This brief adopts both layers in Postern. Briefs 02 and 03 then turn on their own checks inside it.

**Postern has no server of its own** ([corpus/CLAUDE.md](../../CLAUDE.md), "No backend of our own"), so the estate's `server.md` rules file, `no-process-env` and the structure checker don't apply. Its second code root is `jmap/`, a plain-TypeScript client, so the second rules file is `jmap.md`.

### What Postern has today (read 2026-11-09)

- **Workspaces:** `jmap` and `web` (`package.json`), plus two tsc-only projects, `dev/` (the seed scripts) and `web/e2e/` (Playwright).
- **`tsconfig.base.json`** has `strict`, `noUncheckedIndexedAccess`, `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`, `noImplicitOverride`, `isolatedModules`, and `NodeNext` modules. `web/tsconfig.json` overrides to `ESNext`/`bundler`.
  - `verbatimModuleSyntax` is already on in two projects only: `dev/tsconfig.json` and `web/e2e/tsconfig.json`. It is off in `jmap/` and `web/`, which hold 79 and 296 of the 405 TypeScript and JavaScript files.
  - `erasableSyntaxOnly` is off everywhere.
- **`eslint.config.js`** (47 lines): `@eslint/js` recommended, `typescript-eslint` recommended (untyped), `eslint-plugin-react-hooks` 7.1.1 recommended on `web/src`, an unused-vars rule with `_` prefixes, and one **boundary rule** that the new config must keep: `no-restricted-imports` on `jmap/**/*.ts`, which forbids `@postern/web`, `react`, `react-dom` and any `**/web` path.
- **No formatter.** No Prettier config, no `format` script, no `.npmrc` (versions are pinned by hand: no `^` or `~` in either `package.json`).
- **Scripts** (root `package.json`):
  - `typecheck` is six commands in a row: `tsc -b`, `tsc -p jmap/tsconfig.test.json`, `tsc -p web --noEmit`, `tsc -p web/tsconfig.test.json`, `tsc -p dev`, `tsc -p web/e2e`;
  - `check` already exists: `typecheck && lint && test`;
  - there is no `format`, `format:check`, `check:fast` or `check:conventions`.
- **No root `CLAUDE.md` and no `.claude/`.** The only `CLAUDE.md` is [corpus/CLAUDE.md](../../CLAUDE.md), which Claude Code loads only once an agent reads a file under `corpus/`. So an agent that never opens the corpus sees no commands and none of the hard rules (no secrets, no CI, no pushes, message HTML only in the sandbox).
- **The gate can be green with nothing run.** `jmap/test/integration/live.ts:2` says its tests "skip (not fail) when the server or dev/.env is missing", and `describe.skipIf(!live)` guards them (for example `jmap/test/integration/read.test.ts:16`). `web/test/integration/` has three more files. `npm run check` with no local Stalwart up is green with those skipped. This is a gate that reports success while reaching nothing; step 1 counts the skips.
- **No Docker image and no git hook.** The deploy is `vps-deploy`'s `postern` stack, an owner step. Whether that stack runs `npm ci` with `git` on the box is unknown (skills library question 1), which matters for decision 1.

### Measured on 2026-11-09

Taken on a scratch copy of the tracked files (`git ls-files`, copied to a scratch directory outside the repo), with Prettier 3.8.1 and TypeScript 6.0.x from this machine's tools. There were no `node_modules`, so nothing needing types could be checked.

**Prettier churn.** `trailingComma: "all"`, otherwise defaults, on the 342 `.ts`, `.tsx`, `.js` and `.mjs` files that `git ls-files` lists outside `corpus/` (405 including the tests, e2e and config; the count below is files changed). "Lines" counts `diff -r` lines starting `<` or `>`, so it is about twice the number of source lines touched:

| `printWidth` | Diff lines | Files changed |
|---|---|---|
| 100 | 19,476 | 342 |
| 110 | 14,355 | 314 |
| 120 | 10,398 | 274 |
| 130 | 7,661 | 243 |
| 140 | 5,762 | 207 |
| 150 | 4,388 | 194 |
| 160 | 3,406 | 169 |
| 180 | 2,870 | 160 |
| 200 | 2,896 | 171 |
| 240 | 3,037 | 190 |

The command was `prettier --write` over the `git ls-files` list in a copy, then `diff -r` against an untouched copy, once per width.

Two things this shows, and they differ from Almanac's measurement:

- **Postern is the most heavily reformatted repo.** There is no width under which fewer than 160 files change. The code is wrapped by hand at about 120 columns but tolerates long lines: 729 lines are over 140 characters and the longest is 389 (`awk 'length>140'` over the tracked source). Prettier at 130 would rewrap 243 files.
- **The least churn is 180**, which is far from the estate's likely width. Brief 27 measured about 340 lines in 70 files for Almanac at 130, so Postern at 130 is more than twenty times larger. Decision 2 asks the owner.

The other file types:

- **CSS:** 44 diff lines in 2 of the 19 files (`web/src/shell/shell.css` and `web/src/theme/tokens.css`), at width 180.
- **JSON:** 4 files fail `prettier --check`: `dev/config.json`, `jmap/test/fixtures/conversation-list.response.json`, `jmap/test/fixtures/session.alice.json`, and one more. The two fixtures are recorded server responses, so they go in `.prettierignore`.
- **`web/index.html`:** checked with the JSON; the four above are all that failed.
- **Markdown:** 13 of 26 tracked `.md` files fail `prettier --check`.

**TypeScript flags.** Not measured: `verbatimModuleSyntax` and `erasableSyntaxOnly` need the package types. The parser found the `erasableSyntaxOnly` cases without them: **parameter properties at 4 places**, `web/src/keys/shortcuts.ts:166-167` (`private readonly actions`, `private readonly options`, a constructor) and `web/src/push/webPush.test.ts:30-31`. Step 1 runs the real compiler.

**The house shapes**, counted with the TypeScript parser over every tracked `.ts`, `.tsx`, `.js` and `.mjs` file (405 files; the script is in step 1):

| Shape | Count | Where |
|---|---|---|
| `enum` | 0 | |
| `any` (the keyword) | 0 | |
| non-null `!` | **536** | 454 in tests, 82 in 23 non-test files. Largest: `jmap/src/sieve/parse.ts` (24), `jmap/src/search/dates.ts` (8), `jmap/src/sieve/syntax.ts` (7). |
| `@ts-ignore` / `@ts-nocheck` | 0 | |
| `@ts-expect-error` | 3 | `jmap/test/unit/request.test.ts:84, 86, 88`, each with a description |
| `TODO` / `FIXME` / `XXX` / `HACK` | 0 | |
| `console.*` calls | 22 | 16 in `dev/`, 4 in `web/src` (`web/src/actions/bus.ts:46`, `web/src/actions/runner.ts:182`, `web/src/attachments/inline.ts:107`, `web/src/conversation/markRead.ts:27`, all error or warn reports), 2 in tests and e2e setup |
| default exports | 5 | `eslint.config.js:5`, `vitest.config.ts:7`, `web/vite.config.ts:69`, `web/e2e/playwright.config.ts:18`, `web/e2e/global-setup.ts`: all configs |
| namespaces | 0 | |
| parameter properties | 4 | above |
| `void` expressions | 179 | the code already marks discarded promises, which is what `no-floating-promises` wants |

The non-null count is the finding that breaks the estate default. Q13's default is "all of them are errors, fixed not excepted". For 536 assertions that is a refactor, not a cleanup, and 454 of them are in tests where `list[0]!` is the idiom. Decision 6 asks.

**Not measured here:** the six typed rules' finding counts, lint time with `projectService` against `project`, knip's findings, and the vitest plugin's count. Each needs `node_modules`. Step 1 measures them.

One typed-lint problem is visible without running anything. The root `tsconfig.json` has `files: []` and references only `jmap`; `jmap/tsconfig.json` includes `src` and excludes `jmap/src/**/*.test.ts`; the tests sit in `jmap/tsconfig.test.json`, `web/tsconfig.test.json`, `dev/tsconfig.json` and `web/e2e/tsconfig.json`. So `projectService`, which looks for the nearest `tsconfig.json`, will not find a project for `jmap/src/**/*.test.ts`, for `jmap/test/**`, or for `web/test/**`'s tsconfig-less neighbours. Step 1 decides between `projectService` with `allowDefaultProject` and an explicit `project` array.

## Owner decisions (defaults this brief builds)

1. **Where the configs come from** (skills library Q6, brief 27 decision 1). Default: the `house-style` package, extended from Postern's configs, as a `devDependency` on the tagged GitHub tarball URL, which npm fetches without `git`. If the owner prefers `github:`, check first that `vps-deploy`'s stack has `git` on the box (Q1). If Q6 goes the other way (configs copied into the repo), the same rules land as local files with a version header. Steps 3-5 don't change.
2. **Width** (Q8). Default: the estate's one width, whatever Q8 settles. **New question for the grilling:** Postern's least churn is 180, and 130 rewraps 243 files, so a Postern-specific number is worth a minute. If Q8 isn't settled when this runs, use 120, the width the code is already hand-wrapped to, and record the churn (10,398 diff lines in 274 files) in the log entry.
3. **Markdown stays out of Prettier** (Q45). Default: `.prettierignore` lists `*.md`. The corpus is prose that `corpus/lint.sh` governs, and 13 of 26 files would change.
4. **tsconfig** (Q11). Default: add `verbatimModuleSyntax` and `erasableSyntaxOnly` to `tsconfig.base.json`, and not `exactOptionalPropertyTypes`. `dev/` and `web/e2e/` then drop their own copy of `verbatimModuleSyntax`.
5. **Typed lint** (Q12). Default: the six rules, through `projectService` if step 1 shows it finds a project for every file, else an explicit `project` array.
6. **The house shapes as errors** (Q13). Default for every shape but one: error. **The exception, a new question for the grilling:** `@typescript-eslint/no-non-null-assertion`. Default: **error in non-test source** (the 82 are fixed in this brief, or each is rewritten with a narrowing check), and **off in `*.test.{ts,tsx}`**, where 454 assertions are `array[0]!`. Fixing all 536 would take longer than the rest of the brief. The alternative is `warn` everywhere until a later brief.
   - `no-console` is an error outside `dev/**`, `web/e2e/**` and tests. The four `web/src` calls are error reports with no logger to hand, so the default is an `eslint-disable-next-line` with a reason on each, not a logger. *New question.*
   - `no-default-export` allows `*.config.*`, `web/e2e/global-setup.ts` and the e2e config.
7. **`check:fast`** (Q10). Default: `tsc -b` plus `tsc -p web --noEmit`, then ESLint on the changed files, under about 15 s warm with one changed file. The other four typecheck projects are tests, `dev/` and e2e: they run in `check`, not in `check:fast`. Step 5 times it.
8. **The Claude Code layer** (Q7). Default: the plugin's hooks. If the owner chooses committed hooks instead, add them to `.claude/settings.json` here. Postern's rule is that git hooks are an owner step ([corpus/CLAUDE.md](../../CLAUDE.md), "Hard rules"); Claude Code hooks are not git hooks, but say so when handing over.
9. **A root `CLAUDE.md`** (Q46). Default: create one, and move the repo-wide **Hard rules** and **brief-board** sections out of [corpus/CLAUDE.md](../../CLAUDE.md) into it, because they apply outside the corpus.
10. **Integration tests that skip.** Default: leave the skip, and make the root `CLAUDE.md` say that `npm run check` is not the whole gate without `npm run dev:mail` running; step 1 records how many tests skip. The alternative is an environment variable, `POSTERN_REQUIRE_LIVE=1`, that turns the skip into a failure, set by the owner before a deploy. *New question.*

## Files you OWN

- `tsconfig.base.json`; `dev/tsconfig.json` and `web/e2e/tsconfig.json` (only to drop the now-inherited flag); `web/tsconfig.json` (only to add `incremental` with a `tsBuildInfoFile`).
- `eslint.config.js`.
- New: the Prettier config, `.prettierignore`, `.git-blame-ignore-revs`.
- The root `package.json` (scripts, devDependencies) and `package-lock.json`.
- The reformat itself: whitespace-only changes to every file Prettier covers.
- The fixes the new rules ask for:
  - `web/src/keys/shortcuts.ts` (the parameter properties);
  - the 82 non-test non-null assertions listed in step 1;
  - anything else a typed rule finds, fixed or listed in step 4.
- New: `.claude/rules/web.md`, `.claude/rules/jmap.md`, `CLAUDE.md`.
- [corpus/CLAUDE.md](../../CLAUDE.md): its Hard rules and brief-board sections move out.
- `scripts/conventions.json` (brief 15's exceptions file), only if an exception is needed.
- Corpus: [wiki/decisions.md](../../wiki/decisions.md) (a new entry), [wiki/status.md](../../wiki/status.md), [log.md](../../log.md), [.planned-roots](../../.planned-roots) (its note stays; add `.claude` and `scripts` if the lint warns before they exist, remove them once they do).

## Files you must NOT touch

- Behaviour. Apart from the fixes listed above, every change is formatting or configuration.
- `jmap/test/fixtures/*.json`: recorded responses, ignored by Prettier.
- `web/src/render/` rewrites and the message sandbox: format only, no logic.
- The CSS and the component markup, which are briefs 03 and 02.
- The skills library and the `house-style` repo. A rule that seems wrong for Postern is reported back, not patched locally.

## What to do

One commit per step, each with `npm run typecheck`, `npm test`, `npm run lint` and `npm run build` green. Bring the local Stalwart up first (`npm run dev:mail`, `npm run dev:seed`, [docs/getting-started.md](../../../docs/getting-started.md)), so `npm test` runs the integration tests instead of skipping them.

1. **Measure first.** Record these in the `log.md` entry:
   - the compiler's counts with `verbatimModuleSyntax` and `erasableSyntaxOnly` on, per project (the six `tsc` runs);
   - the six typed rules' counts (`no-floating-promises`, `no-misused-promises`, `await-thenable`, `switch-exhaustiveness-check`, `no-unnecessary-type-assertion`, `consistent-type-imports`);
   - lint time with `projectService` against an explicit `project` array, and which files `projectService` cannot place (expect `jmap/src/**/*.test.ts` and `jmap/test/**`);
   - `npx knip` from the `house-style` preset;
   - the vitest plugin's recommended count (`@vitest/eslint-plugin`; helper names to allow: check `grep -rn "expectError"` first, none found on 2026-11-09);
   - how many tests skip with Stalwart down against up (`npx vitest run` both ways), the number for decision 10;
   - the shape counts above, regenerated, with the 82 non-test non-null sites listed by file and line.

   Any rule that finds more than about 20 real problems, or mostly false ones, goes back to the owner before it is turned on (brief 27's rule: bring it, don't loosen it). The non-null rule already does.
2. **Prettier, and the reformat.**
   1. Add `prettier` (pinned) and the config: `printWidth` per decision 2, `trailingComma: "all"`, the rest default.
   2. Add `.prettierignore`:
      - `*.md`;
      - `jmap/test/fixtures/`;
      - `package-lock.json`;
      - `dist/`, `dev-dist/`, `dev/data/`, `coverage/`, `web/e2e/screenshots/`;
      - `web/public/` (icons and SVGs);
      - `dev/seed/hostile/` and `dev/plan.ndjson` (hostile mail samples and seed data, which must stay byte-exact; confirm in step 1 that nothing there is formatted code).
   3. Add `"format": "prettier --write ."` and `"format:check": "prettier --check ."`, and commit this alone.
   4. Run `npm run format` and commit only that, as `style: format with Prettier`. Run it when no other brief has uncommitted work.
   5. Add that commit's full hash to `.git-blame-ignore-revs`, in its own commit.
   6. Hand the owner the one-time `git config blame.ignoreRevsFile .git-blame-ignore-revs`. It is a git setting, so an owner step.
3. **tsconfig.** Add `verbatimModuleSyntax` and `erasableSyntaxOnly` to `tsconfig.base.json`.
   - Fix `web/src/keys/shortcuts.ts:166-167` (and the test's `webPush.test.ts:30-31`) with declared fields assigned in the constructor. Behaviour stays.
   - Fix whatever `verbatimModuleSyntax` reports with inline `type` imports, the house's `import { type X }`.
   - Drop the now-duplicate `verbatimModuleSyntax` from `dev/tsconfig.json` and `web/e2e/tsconfig.json`.
   - Add `"incremental": true` and a `tsBuildInfoFile` under `node_modules/.tmp/` to `web/tsconfig.json` and the web test project.
4. **ESLint.** Extend the house config (decision 1), passing Postern's roots (web is `web/src`, the CLIs are `dev/**`, e2e is `web/e2e/**`), and **keep the `jmap` import boundary exactly** as `eslint.config.js` has it today. The diff in effect:

   | Rule | Today | After | Findings today |
   |---|---|---|---|
   | the six typed rules above | off | error | step 1 |
   | `@typescript-eslint/no-non-null-assertion` | off | error outside tests, off in tests (decision 6) | 82 non-test, 454 test |
   | `no-restricted-syntax` on `TSEnumDeclaration` | off | error | 0 |
   | `no-warning-comments` (`todo`, `fixme`), pointing at `corpus/todos/` | off | error | 0 |
   | `no-console` outside `dev/**`, `web/e2e/**` and tests | off | error | 4, each given a reasoned disable |
   | `no-default-export` (`eslint-plugin-import-x`) outside `*.config.*` and the e2e config files | off | error | 0 |
   | `@vitest/eslint-plugin` recommended on `*.test.{ts,tsx}` | off | error | step 1 |
   | `no-explicit-any`, `ban-ts-comment` | error (recommended) | unchanged (the 3 `@ts-expect-error` carry a description) | 0 |
   | `react-hooks` recommended on `web/src` | on | unchanged | 0 |
   | `no-restricted-imports` on `jmap/**` | on | unchanged | 0 |
   | `better-tailwindcss` | absent | brief 03 adds it | |
   | `no-process-env` | n/a | not added: there is no server to read the environment (`web/vite.config.ts` and `dev/` read it by design) | |

   Fix what the typed rules find, or list each finding left, with its reason, in the outcome note.
5. **The gate.** In the root `package.json`:
   - `check` runs, in this order, `typecheck`, `lint`, `format:check`, `check:conventions`, `test`;
   - `check:conventions` is knip plus `check-base-ui`, run `--warn-only` until brief 03 is done. There is no `check-structure` here (no server), and no dependency-cruiser: the one boundary Postern has, `jmap` not importing `web`, is the ESLint rule above;
   - `check:fast` runs `tsc -b`, `tsc -p web --noEmit`, then ESLint on the files changed against `HEAD` plus untracked ones (`*.ts`, `*.tsx`, `*.js`, `*.mjs` that exist). Use the package's script for the changed-file list if it ships one, or a small Node script in `scripts/`. No shell-only syntax: the owner works on Windows under WSL;
   - `lint` stays `eslint .`.

   Time `check:fast` warm with one changed file, and `check` in full, with Stalwart up. Record both.
6. **`.claude/rules/`.** Keep each file under about 40 lines. Each carries the rules an agent must hold while editing there, and points at the skill for the rest.
   - **`web.md`** (`paths: ["web/src/**"]`):
     - read the `base-ui` skill, and for UI work [wiki/design.md](../../wiki/design.md) and [wiki/overlays.md](../../wiki/overlays.md);
     - message HTML goes only into the sandboxed `<iframe>`, never into the app's DOM ([wiki/security.md](../../wiki/security.md));
     - the access token lives in memory, the refresh token in `sessionStorage`, nothing in `localStorage` ([wiki/decisions.md](../../wiki/decisions.md));
     - Base UI only through the wrappers brief 02 creates, from subpaths; a trigger around a component uses `render`;
     - dialogs come from the `Modal` wrapper, which holds the Escape guard and initial focus; the composer window stays a native `<dialog>`;
     - the two comboboxes (recipients, search) and the sender card stay hand-built ([wiki/decisions.md](../../wiki/decisions.md));
     - glossary words in UI copy ([wiki/glossary.md](../../wiki/glossary.md));
     - the theme is the `light-dark()` tokens plus the `data-theme` switch, never a raw hex in a component.

     Brief 03 adds the Tailwind lines.
   - **`jmap.md`** (`paths: ["jmap/src/**", "jmap/test/**"]`):
     - plain TypeScript: no React, no DOM, no import from `web` (the ESLint boundary);
     - the RFCs (8620, 8621) and Stalwart's docs win over the wiki ([corpus/CLAUDE.md](../../CLAUDE.md), "Source of truth");
     - tests that need a server are `describe.skipIf(!live)` against the local Stalwart, never the real mailbox.
7. **`CLAUDE.md`** at the root, under about 60 lines:
   - one line on what Postern is;
   - "read [corpus/index.md](../../index.md) first";
   - the commands:
     - `npm run dev` (needs `npm run dev:mail` first);
     - `npm run check` before every hand-back, and `npm run check:fast`;
     - one test with `npx vitest run <file>`;
     - `npm run test:e2e` (builds, needs Docker);
   - the places that mislead:
     - `typecheck` is six runs;
     - `npm test` skips the integration tests without the local Stalwart, so a green `check` can mean they did not run (decision 10);
     - the Node requirement is 24 (`package.json` `engines`);
   - the moved Hard rules and brief-board sections.

   [corpus/CLAUDE.md](../../CLAUDE.md) keeps everything else: layout, retrieval budget, frontmatter, briefs, source of truth, decisions and glossary, writing.
8. **Corpus.**
   - Add the [wiki/decisions.md](../../wiki/decisions.md) entry "The house style, formatted and checked", with the width, the config source, the non-null rule's scope, what was rejected and why.
   - Update [wiki/status.md](../../wiki/status.md) and [log.md](../../log.md).
   - Run `bash corpus/lint.sh` until it is clean.

## Acceptance

- [ ] `npm run check` passes with the local Stalwart up. Its run time and `check:fast`'s, warm with one changed file, are in the outcome note, and `check:fast` is under about 15 s or the owner has accepted the time.
- [ ] `npx prettier --check .` passes. The reformat is one commit that changes whitespace only (`git diff -w <hash>^ <hash>` shows nothing outside the reformat), and its hash is in `.git-blame-ignore-revs`.
- [ ] `grep -n "verbatimModuleSyntax\|erasableSyntaxOnly" tsconfig.base.json` prints both, and `npm run typecheck` passes.
- [ ] ESLint reports zero errors with every rule in step 4's table. The counts before and after are in the outcome note, and so is every finding left with its reason.
- [ ] A deliberate `enum`, `!` in `web/src`, `console.log` in `web/src`, `// TODO` and `export default` each fail `npm run lint`. A `react` import in `jmap/src` still fails it. Revert them after.
- [ ] `.claude/rules/web.md` and `jmap.md` exist with `paths:` frontmatter. The root `CLAUDE.md` is under about 60 lines and lists `npm run check`.
- [ ] With the plugin's hooks on, an agent's edit is formatted on save, and a type error stops it at `Stop`.
- [ ] `bash corpus/lint.sh` ends clean.

## Interplay

- Brief 02 adds nothing to the gate. Brief 03 adds `better-tailwindcss` and drops `check-base-ui`'s `--warn-only`.
- The reformat changes 2 of the 19 CSS files (`shell.css`, `tokens.css`); brief 03 deletes them all.
- No server brief follows this one, because Postern has no server. Its `check:conventions` is therefore only knip and the Base UI checker.
