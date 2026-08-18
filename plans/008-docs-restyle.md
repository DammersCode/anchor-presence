# Plan 008: Restyle README and docs to the use-signalr house style, in Simplified Technical English

> **Executor instructions**: Follow step by step; verify each step; STOP
> conditions are binding. Update `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat 74f9e92..HEAD -- README.md docs packages/*/README.md apps/demo/README.md LICENSE`
> On mismatch with "Current state", STOP. (Plan 002 adding LICENSE and
> package.json metadata is EXPECTED drift — proceed; its absence is the anomaly.)

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: LOW
- **Depends on**: plans/002-npm-publish-readiness.md (MIT badge + license link need the LICENSE file); best executed LAST so content reflects plans 003–007
- **Category**: docs
- **Planned at**: commit `74f9e92`, 2026-08-18

## Why this matters

Owner directive: align this repo's README/docs with the house style of their existing library `use-signalr` (github.com/DammersCode/use-signalr), keep the Simplified Technical English discipline the docs already use, and surface the MIT license. Consistent presentation across the owner's libraries is the goal; content is already accurate, so this is a restructure, not a rewrite.

## Current state

- `README.md` (root) — accurate but structured as: pitch, features, layout, quickstart, docs index, development. No badge, no capability matrix, no minimum-versions table.
- `docs/` — 10 pages (architecture, concepts, responsive-layouts, ui-context, react, transports, codecs, performance, security, troubleshooting), already in STE.
- `packages/core|dom|react/README.md` — short per-package pages. `apps/demo/README.md` — run instructions.
- `LICENSE` — exists only after plan 002; badge must link to it.

### The use-signalr house style (verified 2026-08-18 — inline, do not re-fetch)

Section order: (1) Title + one-line tagline naming what it is and what it supports; (2) single MIT license shield badge; (3) a real code example BEFORE any prose sections; (4) packages table (name, description, link); (5) capability matrix — features as rows, adapters as columns, ✅ marks; (6) minimum-versions table; (7) "The Contract" style section explaining the core configuration/mental model; (8) features bullet list; (9) comparison tables for API choices, framed prescriptively ("Pick by intent"); (10) contributing/license footer linking out. Tone: technical, prescriptive, pragmatic — explains WHEN to use a thing, not only what it does. Emoji: only ✅ in matrices. Headings: plain `##`/`###`, no numbering. Length target ≈ 2,500 words.

### STE rules to enforce (inline — the executor has no access to the skill)

- Procedures: imperative, ≤ 20 words per sentence, one instruction per sentence, condition BEFORE command ("If the build fails, read the log.").
- Descriptions: simple present, ≤ 25 words per sentence, one topic per paragraph, ≤ 6 sentences per paragraph.
- Modals: only can / will / must. NEVER should, would, may, might, could.
- Banned filler: simply, just, easily, seamlessly, robust, powerful, leverage, utilize, "in order to", "it is worth noting". Use "use", "to", "for example" (not "e.g.").
- One term per concept repo-wide: "make sure" (not check/verify/ensure), "configuration" (not settings), "error".
- Code identifiers, commands, and code blocks are exempt and stay exact.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Slop scan | `grep -rinE " should | may | might | simply | just | leverage|in order to" README.md docs/ packages/*/README.md` | no matches in prose (code blocks exempt — inspect hits) |
| Link check | `grep -oE "\]\((docs|packages|apps|LICENSE)[^)]*\)" README.md` then confirm each path exists | all resolve |
| Gate (unchanged code) | `bunx vitest run` | green |

## Scope

**In scope**: `README.md`, `docs/*.md`, `packages/*/README.md`, `apps/demo/README.md`.
**Out of scope**: ANY code file, SPECIFICATION.md, PLAN.md, `plans/` (except the status row), LICENSE content.

## Git workflow

Branch `advisor/008-docs-restyle`; plain messages, no AI mention; no push unless instructed.

## Steps

### Step 1: Rebuild root README in the house structure

Order: title + tagline ("Semantic live cursors for the DOM — different layouts, same meaning" or similar, ≤ 15 words); MIT badge `[![MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)`; a 15–25-line React quickstart code block (provider + `useCursorAnchor` + `useRemoteCursors`, taken from working demo code); packages table (core/dom/react + demo/server apps); capability matrix — rows: semantic anchors, fallback chains, viewport fallback, UI context policies, occlusion detection (only if plan 003 landed — check `grep pointVisible packages/dom/src/resolver.ts`), interpolation, transport-agnostic, SSR; single ✅ column "React" (honest: one adapter today); minimum-versions table (React ≥ 18, TypeScript per current devDep, evergreen browsers incl. the ResizeObserver/MutationObserver/pointer-events requirement, Bun for the demo); "The Contract" section: the sender→receiver flow in ≤ 10 lines (compress from `docs/architecture.md`); features bullets; comparison table "Pick by intent" for the three tiers (anchor / viewport / hidden) and for policy outcomes; footer: docs index links, license line "MIT © DammersCode".

**Verify**: link-check command — every referenced path exists; word count roughly ≤ 2,800 (`wc -w README.md`).

### Step 2: Package READMEs to house style

Each of the three: tagline, badge, one code example first, then boundary rule ("core imports no DOM"), main exports table, link to root docs. Keep ≤ 80 lines each. `apps/demo/README.md`: keep run instructions; adjust tone/order only.

**Verify**: slop scan clean on the three files.

### Step 3: docs/ pass — style only

For each of the 10 docs pages: enforce the STE rules above (they largely comply — fix drift), convert any "should"-type modal, ensure every page starts with a one-paragraph description then procedures, and prescriptive framing ("Pick X when Y"). Do NOT change technical claims; if a claim looks wrong, note it in the report instead of editing it.

**Verify**: slop scan across `docs/` — prose clean; `git diff --stat` shows only .md files.

### Step 4: Cross-consistency

Terms unified per the one-term rule (grep for "settings"→"configuration" drift in prose, "verify/ensure"→"make sure"). Capability matrix claims cross-checked against exports (`packages/*/src/index.ts`) — no advertised feature that code lacks.

**Verify**: `bunx vitest run` green (proves no code was touched by accident); final slop scan clean.

## Test plan

No code tests. Verification = the grep gates above plus the link check. A human skim of README top-to-bottom is the acceptance review.

## Done criteria

- [ ] README follows the 10-point house order incl. badge, matrix, minimum versions
- [ ] Slop scan clean across all in-scope prose
- [ ] All README links resolve; matrix matches actual exports
- [ ] Only .md files changed (`git diff --stat`)
- [ ] `plans/README.md` updated

## STOP conditions

- LICENSE missing (plan 002 not landed) — stop; dependency violated.
- A docs page's technical claim contradicts the code you cross-check — report, do not silently rewrite the claim.

## Maintenance notes

- The capability matrix is a standing honesty contract: every future feature plan must update it (add to reviewer checklist).
- If more framework adapters ever ship (currently ruled out by the owner), the matrix grows columns — the structure anticipates it; nothing else needs restructuring.
