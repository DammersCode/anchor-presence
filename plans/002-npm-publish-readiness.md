# Plan 002: Make the three packages publishable to npm under the MIT license

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 74f9e92..HEAD -- packages LICENSE package.json`
> On mismatch with "Current state" excerpts, STOP.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED (publishing metadata errors are public once shipped)
- **Depends on**: plans/001-ci-github-actions.md
- **Category**: dx
- **Planned at**: commit `74f9e92`, 2026-08-18

## Why this matters

The library is finished and verified but not installable by anyone. The packages already have correct `exports` maps, `types`, `sideEffects: false`, and `files: ["dist"]`; what is missing is licensing, npm metadata, versioning workflow, and a scope decision. The user has decided: MIT license, publish soon.

## Current state

- No `LICENSE` file anywhere in the repo.
- `packages/core/package.json` (dom/react are identical in shape):

```json
{
  "name": "@anchor-presence/core",
  "version": "0.1.0",
  "type": "module",
  "sideEffects": false,
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": { ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" } },
  "files": ["dist"],
  "scripts": { "build": "tsc --build" }
}
```

- No `license`, `repository`, `author`, `description`, `keywords`, or `publishConfig` fields in any package.
- `packages/dom` and `packages/react` depend on siblings via `"workspace:*"` — Bun rewrites these to real versions at publish time (`bun publish` handles this; plain `npm publish` does NOT).
- Owner identity for license/author: `DammersCode` (see git log / github.com/DammersCode). The sibling project use-signalr uses "MIT © DammersCode".
- Repo URL: `https://github.com/DammersCode/anchor-presence.git`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Build all packages | `bunx tsc --build packages/core packages/dom packages/react` | exit 0; each package has `dist/` |
| Scope availability | `npm view @anchor-presence/core 2>&1` | `404` / "not found" = name free |
| Pack dry run | `cd packages/core && bun publish --dry-run` | tarball listing shows `dist/**`, `README.md`, `LICENSE`, package.json — nothing else |
| Full gate | `bunx vitest run` | all pass |

## Scope

**In scope**:
- `LICENSE` (create, repo root)
- `packages/core/package.json`, `packages/dom/package.json`, `packages/react/package.json` (metadata fields only)
- `packages/*/LICENSE` (copies, or `files` additions)

**Out of scope**:
- Any source code change.
- Actually running `bun publish` without `--dry-run` — publishing is an operator action.
- Changesets/versioning tooling — deferred (see Maintenance notes).
- `apps/*` package.json files (private, never published).

## Git workflow

- Branch: `advisor/002-publish`
- One commit per logical unit is fine. Plain messages, no AI mention.
- Do NOT push unless the operator instructed it.

## Steps

### Step 1: Confirm the npm scope

Run `npm view @anchor-presence/core`. A 404 means the name is free — but the `@anchor-presence` SCOPE must belong to the operator's npm account/org before publish works.

**Verify**: command returns 404 (name unpublished). If it returns package data, STOP (name squatted — operator must pick a new scope).

### Step 2: Add the MIT license

Create `LICENSE` at the repo root: standard MIT text, `Copyright (c) 2026 DammersCode`. Copy the file into each of `packages/core/`, `packages/dom/`, `packages/react/` (npm only bundles files inside the package dir; `files` already implicitly includes LICENSE/README).

**Verify**: `ls LICENSE packages/core/LICENSE packages/dom/LICENSE packages/react/LICENSE` — all four exist.

### Step 3: Add publish metadata to all three package.json files

Add to each (adjusting `description` per package):

```json
"description": "<one line — core: framework-agnostic live cursor presence engine; dom: DOM anchor registry, geometry scheduling and cursor resolution; react: React hooks and provider for anchor-presence>",
"license": "MIT",
"author": "DammersCode",
"repository": { "type": "git", "url": "git+https://github.com/DammersCode/anchor-presence.git", "directory": "packages/<name>" },
"homepage": "https://github.com/DammersCode/anchor-presence#readme",
"keywords": ["live-cursors", "presence", "collaboration", "multiplayer", "cursor", "realtime"],
"publishConfig": { "access": "public" }
```

**Verify**: `bun install` exits 0 (lockfile consistent), then `bunx vitest run` all green.

### Step 4: Dry-run publish each package

Build first, then `bun publish --dry-run` in each package directory (bun resolves `workspace:*` to the concrete version — inspect the output to confirm, e.g. `"@anchor-presence/core": "0.1.0"` in dom's manifest).

**Verify**: each tarball lists only `dist/**`, `package.json`, `README.md`, `LICENSE`; workspace specifiers are rewritten to `0.1.0`.

## Test plan

No new tests — metadata only. The dry-run tarball inspection in Step 4 is the test.

## Done criteria

- [ ] `LICENSE` at root + one copy per package, MIT, DammersCode
- [ ] All three package.json files carry license/author/repository/description/keywords/publishConfig
- [ ] Three successful `bun publish --dry-run` outputs with rewritten workspace deps
- [ ] `bunx vitest run` green; `git status` clean
- [ ] `plans/README.md` updated

## STOP conditions

- Step 1 finds the scope taken.
- `bun publish --dry-run` does NOT rewrite `workspace:*` (would ship a broken manifest) — report; do not switch to npm CLI improvisation.
- Anything beyond `dist/`, README, LICENSE, package.json appears in a tarball.

## Maintenance notes

- Versioning: packages are lockstep `0.1.0`. Recommend adding changesets in a later plan once release cadence exists; premature tooling was deliberately skipped.
- The real `bun publish` (operator action) requires `npm login` and scope ownership; document the two commands in the release PR description.
- Plan 008 adds an MIT badge to the README that assumes this plan landed.
