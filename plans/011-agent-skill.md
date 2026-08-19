# Plan 011: Ship an agent skill for anchor-presence on skills.sh

> **Executor instructions**: Follow this plan step by step. On a STOP
> condition, stop and report. Update the status row in `plans/README.md`
> when done.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW (documentation artifact; no runtime code)
- **Depends on**: plans/010-configurable-react-cursors.md (the quickstart uses `CursorLayer`)
- **Category**: direction
- **Planned at**: commit `8bfaaf4`, 2026-08-19

## Why this matters

skills.sh lists skills automatically: a public GitHub repo with a valid `SKILL.md`, installed via `npx skills add DammersCode/anchor-presence`, appears and ranks by installs. A well-made integration skill turns any agent into a competent anchor-presence integrator and markets the library. There is no upload step, account, or approval queue.

## Design rules (from the top-20 research, binding)

Derived from the writing-for-agents doctrine and the structure of the top-ranked skills (grilling, tdd, vercel-react-best-practices):

1. `SKILL.md` stays tight (target ≤ 70 lines of body). Reference is disclosed into sibling files reached by pointers, loaded only when a branch needs them.
2. Frontmatter: `name`, `description`. The description is the always-loaded context pointer: front-load the trigger words, one trigger per distinct branch, no synonym padding.
3. Model-invoked (no `disable-model-invocation`): agents must reach it when a user asks for live cursors.
4. Leading words, bolded and reused as tokens: **anchor**, **chain**, **tier**, **policy**, receiver-authoritative.
5. Steps end on checkable, demanding completion criteria (the integration proof: two windows at different sizes show each other's cursors on the same anchored element).
6. Positive phrasing throughout; prohibitions only for hard guardrails (untrusted user data), paired with the positive action.
7. The skill is self-contained when installed: no relative pointers into this repo's docs; external references use full GitHub URLs.
8. Do not cache what the consumer's environment answers (their package manager, their bundler); cache what no lookup reveals (ID conventions, instance-vs-user identity, the receiver-authoritative model).

## Scope

**In scope**: `skills/anchor-presence/SKILL.md` (create), `skills/anchor-presence/anchors.md` (create), `skills/anchor-presence/troubleshooting.md` (create), `plans/README.md` (status row).
**Out of scope until plan 010 is merged**: `README.md` (install command + skills.sh badge `skills.sh/b/DammersCode/anchor-presence` — add in a follow-up commit after 010 lands to avoid conflicting with 010's README edits). Any package source.

## Steps

1. Write the three files per the design rules. The quickstart uses the plan-010 `CursorLayer` API exactly as approved in `plans/designs/2026-08-19-configurable-cursor-components-design.md`.
2. Verify: every code identifier in the skill exists in the approved API surface (spec v1.3 + design doc); every external URL resolves; SKILL.md body ≤ ~70 lines; description ≤ 2 sentences with front-loaded triggers.
3. Commit to `dev` with a plain message. After plan 010 merges to `main`, merge this too, then add the README badge/install line in a follow-up commit.
4. Post-merge check: `npx skills add DammersCode/anchor-presence` from a scratch directory discovers the skill (operator may run this; requires the commit on the default branch).

## STOP conditions

- Plan 010's API changes during its execution in a way that invalidates the quickstart — re-sync the skill before merging.
- The skills.sh CLI fails to discover `skills/anchor-presence/SKILL.md` after merge — investigate the expected directory layout before restructuring.

## Done criteria

- [ ] Three skill files exist and follow every design rule above.
- [ ] Quickstart compiles conceptually against the plan-010 API (names and props exact).
- [ ] `plans/README.md` row added/updated.
- [ ] README badge + install command deferred note recorded (or applied, if 010 already merged).
