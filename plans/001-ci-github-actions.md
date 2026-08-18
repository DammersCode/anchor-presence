# Plan 001: Add a GitHub Actions CI workflow that runs the full gate on every push

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 74f9e92..HEAD -- package.json playwright.config.ts vitest.config.ts .github`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx
- **Planned at**: commit `74f9e92`, 2026-08-18

## Why this matters

The repo has 147 unit tests and a 24-case Playwright cross-layout suite, all green, but nothing runs them automatically. Every future change (dependency updates, occlusion work, docs) risks silent regression. CI locks in the current verified state before riskier plans execute. This plan must land first.

## Current state

- No `.github/` directory exists.
- Bun workspaces monorepo. Root `package.json` scripts: `"typecheck": "tsc --build packages/core packages/dom packages/react"`, `"test": "vitest run"`, `"test:browser": "playwright test"`.
- `playwright.config.ts` (repo root) starts two webServers itself: the Bun relay (`bun run --cwd apps/server dev`, port 8787) and Vite dev (`bun run --cwd apps/demo dev` on port 5917 via `E2E_DEMO_PORT`). Projects: chromium, firefox, webkit. Tests in `e2e/`.
- Tooling is invoked with `bunx` (Bun is the package manager; TypeScript/Vitest are devDependencies).
- The demo build (`apps/demo`) verifies the React integration compiles with React Compiler enabled.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `bun install` | exit 0 |
| Typecheck | `bunx tsc --build packages/core packages/dom packages/react` | exit 0, no output |
| Unit tests | `bunx vitest run` | `Tests  147 passed` (count may be higher if later plans landed) |
| Demo build | `cd apps/demo && bunx vite build` | `✓ built in …` |
| Browser tests | `bunx playwright test` | `0 failed` |

## Scope

**In scope** (the only files you may create/modify):
- `.github/workflows/ci.yml` (create)

**Out of scope**:
- Any change to package.json scripts, playwright.config.ts, or test files. If CI needs a config change to pass, STOP and report.
- Publishing/release automation (plan 002 owns that).

## Git workflow

- Branch: `advisor/001-ci`
- One commit. Plain message, no Co-Authored-By trailer, no AI mention (repo rule).
- Do NOT push and do NOT open a PR unless the operator instructed it; report the branch name instead.

## Steps

### Step 1: Write the workflow

Create `.github/workflows/ci.yml`, one job on `ubuntu-latest`, triggered on `push` to `main` and on `pull_request`:

1. `actions/checkout@v4`
2. `oven-sh/setup-bun@v2` (latest Bun)
3. `bun install --frozen-lockfile`
4. Typecheck: `bunx tsc --build packages/core packages/dom packages/react`
5. Unit tests: `bunx vitest run`
6. Demo build: `bunx vite build` with `working-directory: apps/demo`
7. `bunx playwright install --with-deps chromium firefox webkit`
8. Browser tests: `bunx playwright test`
9. On failure, upload `playwright-report/` with `actions/upload-artifact@v4` (`if: failure()`).

Cache the Playwright browser downloads (`~/.cache/ms-playwright`) keyed on the `@playwright/test` version from `bun.lock` to keep runs fast.

**Verify**: `bunx yaml-lint .github/workflows/ci.yml` is NOT available in this repo — instead verify with `node -e "require('js-yaml')"` only if js-yaml exists; otherwise rely on Step 2.

### Step 2: Verify the full gate locally

Run the exact commands from the workflow, in order, at the repo root.

**Verify**: every command matches the "Expected on success" column above.

### Step 3: Commit

**Verify**: `git status --short` shows only `.github/workflows/ci.yml` committed, working tree clean.

## Test plan

No new tests. The workflow IS the test infrastructure; local execution of each workflow command (Step 2) is the proxy verification since the runner is not available locally.

## Done criteria

- [ ] `.github/workflows/ci.yml` exists and contains all 5 gate commands (typecheck, vitest, demo build, playwright install, playwright test)
- [ ] Every command in the workflow was run locally and passed (Step 2)
- [ ] `git status` clean; only the workflow file added
- [ ] `plans/README.md` status row updated

## STOP conditions

- Any local gate command fails — the baseline is broken; report which one.
- You feel the need to modify playwright.config.ts or package.json to make CI viable (e.g. ports, timeouts). Report the needed change instead of making it.

## Maintenance notes

- Plan 005 (dependency updates) will churn this workflow's cache keys; the Playwright cache key must track the version.
- When plan 002 lands, a separate release workflow may be added; keep CI and release workflows in separate files.
- Firefox/WebKit run only 2 of 8 e2e scenarios by design (`test.skip` guards) — a "12 passed, 12 skipped" summary is healthy, not suspicious.
