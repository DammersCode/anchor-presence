# Plan 005: Update all dependencies to the newest versions compatible with LTS runtimes

> **Executor instructions**: Follow this plan step by step, IN WAVE ORDER —
> each wave ends with the full gate and its own commit, so a failing wave can
> be reverted alone. On any STOP condition, stop and report. When done, update
> `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 74f9e92..HEAD -- package.json bun.lock apps/demo/package.json packages`
> On mismatch, re-run `bun outdated` and reconcile before proceeding.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED (two major Vite versions, one major Vitest, TypeScript 7)
- **Depends on**: plans/001-ci-github-actions.md (gate must exist first)
- **Category**: migration
- **Planned at**: commit `74f9e92`, 2026-08-18

## Why this matters

Owner directive: all dependencies at the newest versions aligned with LTS. `bun outdated` on 2026-08-18 reported (root): typescript 5.9.3 → 7.0.2, vitest 3.2.7 → 4.1.11, jsdom 26.1.0 → 30.0.1, @types/node 24.13.3 → 26.2.0; (apps/demo): vite 6.4.3 → 8.2.1, @vitejs/plugin-react 4.7.0 → 6.0.5, typescript same. Staying two majors behind on the build chain compounds; upgrading now, behind a full CI gate, is cheap.

## Current state

- Root `package.json` devDependencies: `@playwright/test ^1.62.1`, `@types/node ^24.0.0`, `jsdom ^26.0.0`, `typescript ^5.7.0`, `vitest ^3.0.0`.
- `vitest.config.ts` uses the `test.projects` array form (core=node, dom/react=jsdom).
- `apps/demo/package.json`: `vite ^6`, `@vitejs/plugin-react ^4.7`, `tailwindcss`/`@tailwindcss/vite ^4.1`, `react`/`react-dom ^19.1`, `babel-plugin-react-compiler ^1.0`.
- `packages/react/package.json` devDeps: `@types/react`/`@types/react-dom ^19`, react 19.
- Runtime alignment (2026-08): Node active LTS is 24.x → keep `@types/node` on the latest **24.x**, NOT 26.x (26 tracks non-LTS Node current). Bun is the actual runtime/package manager.
- TypeScript 7 is the new native-compiler major. All three packages use `tsc --build` with composite project references; TS 7 support for every flag in `tsconfig.base.json` (`verbatimModuleSyntax`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, composite/declaration builds) must be proven by the gate, not assumed.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Outdated report | `bun outdated` (root and `apps/demo`) | table |
| Targeted update | `bun update <pkg>@<range>` in the owning workspace dir | lockfile updated |
| Full gate | `bunx tsc --build packages/core packages/dom packages/react && bunx vitest run && (cd apps/demo && bunx tsc --noEmit && bunx vite build) && bunx playwright test` | all green |

## Scope

**In scope**: `package.json` (root), `apps/demo/package.json`, `packages/react/package.json` (devDeps only), `bun.lock`, `vitest.config.ts` and `apps/demo/vite.config.ts` ONLY where a major-version migration requires a config-shape change (cite the migration guide line in the commit message).
**Out of scope**: source code changes beyond what a compiler/test-runner major strictly forces; adding or removing dependencies; `packages/core|dom` package.json (they have no external deps — keep it that way).

## Git workflow

Branch `advisor/005-deps`; ONE COMMIT PER WAVE (revertable); plain messages, no AI mention; no push unless instructed.

## Steps

### Wave 1 — low risk

`bun update` at root: latest `jsdom` (30.x), latest `@types/node` **within ^24** (pin range `^24`), latest `@playwright/test`. If Playwright minor changed, re-run `bunx playwright install`.

**Verify**: full gate green. Commit.

### Wave 2 — Vitest 4

Root: `bun update vitest@^4`. Read the Vitest 4 migration notes (changelog) for `projects` config changes; adjust `vitest.config.ts` minimally if the projects syntax moved.

**Verify**: `bunx vitest run` all pass, same test count as before the wave; full gate green. Commit.

### Wave 3 — Vite 8 + plugin-react 6

In `apps/demo`: `bun update vite@^8 @vitejs/plugin-react@^6`, plus latest `tailwindcss`/`@tailwindcss/vite` 4.x and `babel-plugin-react-compiler` 1.x. Confirm the React Compiler babel wiring still applies (build output should still show `_c(` memoization sentinels or the compiler runtime in the bundle).

**Verify**: `bunx vite build` succeeds AND `bunx playwright test` 0 failed (e2e runs the dev server — this is the real compat check). Commit.

### Wave 4 — TypeScript 7 (attempt, with sanctioned fallback)

Root + apps/demo + packages/react devDep: `bun update typescript@^7`.

**Verify**: full gate. If `tsc --build` rejects any current flag or emits different declarations that break consumers: fall back to the newest TypeScript 6.x (or stay 5.9 if 6.x also fails), commit THAT, and record the exact error in `plans/README.md` under the status row. Fallback is an accepted outcome, not a failure.

### Wave 5 — record

Re-run `bun outdated` in root and apps/demo; paste both tables into the completion report. Anything still outdated must have a one-line reason (e.g. "@types/node 26 tracks non-LTS Node").

## Test plan

No new tests. The existing 147+ unit tests, demo build, and 24-case Playwright suite are the migration test. Test COUNT must not drop across waves — a dropped count means a silently skipped project/config.

## Done criteria

- [ ] All four waves committed separately, each with a green full gate
- [ ] `bun outdated` final tables recorded; every remaining hold has a reason
- [ ] Unit test count ≥ pre-plan count; Playwright 0 failed
- [ ] No source-file changes except compiler/config-forced ones, each cited
- [ ] `plans/README.md` updated (including TS 7 outcome)

## STOP conditions

- A wave's gate stays red after applying the official migration steps for that major — revert the wave's changes, record the error, continue with the NEXT wave.
- Any update forces a change in `packages/core|dom` source or adds a runtime dependency anywhere — report.
- `bun update` rewrites unrelated ranges in the lockfile beyond the targeted packages in a way you cannot explain — reset and update one package at a time.

## Maintenance notes

- CI (plan 001) caches Playwright browsers keyed on version — the key rolls automatically after Wave 1.
- Revisit `@types/node` when Node 26 reaches LTS (October 2026): bump range to ^26 then.
- If TS 7 was deferred here, open a follow-up plan when vitest/vite peers declare TS 7 support.
