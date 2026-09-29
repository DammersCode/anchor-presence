# 041 Final list and PR

Status: open · Branch: `audit-improvements` · Part of [030](030-multi-audit.md)

Goal: close out 030 — the reviewable list is current, plans are done, and the branch is open as a PR to `main` (merge only when the owner asks).

## Changes

- `plans/research/multi-perspective-audit.md`: fill in the "applied" column with the commit subjects of 031-040; mark deferred items unchanged.
- `plans/030-multi-audit.md`: status `done` (outcome lives in the code, docs, and changelog).
- `plans/README.md`: rows 031-041 to `done` (move to the shipped table or keep in progress until merged — keep in progress until the PR merges, then fold).
- Review `git log dev..audit-improvements` (subjects lowercase, no attribution trailers); fix anything off before pushing.

## Verify

- Full gate run 1-6 on the branch head.
- Push `audit-improvements`, open the PR with `gh pr create` (title: `audit improvements: hot paths, provider-owned client, usability fixes`; body: pointer to `plans/research/multi-perspective-audit.md`, the breaking-change list, and the deferred backlog).

## Commit

`close out the multi-perspective audit` (plan files only)
