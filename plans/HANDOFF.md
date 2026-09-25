# Handoff

Read this file first when you continue work in this repo. Update it when a workstream changes state.

## Program (started 2026-09-25)

Owner request: replace the GitHub Pages site with a Fumadocs docs site on Vercel (gridcn style), add backend examples (Bun native, Node `ws`, Hono, Elysia), make the docs LLM-compatible, run a gap audit and close the gaps, make CI reliable, and extend the e2e tests.

Owner decisions:

- Docs: Fumadocs in `apps/docs`, the design of the old `site/index.html`, deployed on Vercel. The owner imports the repo in Vercel (Root Directory `apps/docs`).
- Examples: live in-browser demos plus backend code tabs. Real backends stay in `examples/` with integration tests.
- Backends to implement: Bun native, Node `ws`, Hono, Elysia. Edge, managed realtime, and other languages are plans only (`plans/backends/`).
- Work runs on `dev`. Merge to `main` only after the owner says yes. The repo stays private.
- Everything is in English. Docs prose follows `.agents/skills/simple-english`.

## Workstreams

| Plan                                                        | Branch              | Worktree                        | Status              |
| ----------------------------------------------------------- | ------------------- | ------------------------------- | ------------------- |
| Agent rules, repo skills                                    | `dev`               | main tree                       | done (`4a0f916`)    |
| Plans cleanup and future backend plans                      | `dev`               | main tree                       | done (`697692f`)    |
| [022 Gap closure](022-gap-closure-2026-09-25.md) — packages | `package-gaps`      | `C:/repos/danny/ap-wt-packages` | in progress         |
| [023 Fumadocs docs site](023-fumadocs-docs-site.md)         | `docs-fumadocs`     | `C:/repos/danny/ap-wt-docs`     | in progress         |
| [024 Backend examples](024-backend-examples.md)             | `examples-backends` | `C:/repos/danny/ap-wt-backends` | in progress         |
| 022 Gap closure — demo, e2e, CI                             | `dev`               | main tree                       | open (after merges) |

Each branch keeps its own progress in `plans/handoffs/<branch>.md`. Read that file before you continue a branch.

## Next steps

1. Merge `examples-backends`, `package-gaps`, and `docs-fumadocs` into `dev` (in this order; conflicts expected in `ci.yml`, `vitest.config.ts`, `package.json`, `CHANGELOG.md`, `backends/meta.json`). Fold each `plans/handoffs/<branch>.md` into this file, then delete it.
2. Demo fixes: WCAG AA label colors, `aria-live` on the presence pill, random default room.
3. E2E: in-place socket drop and reconnect; room isolation.
4. CI: `concurrency`, Bun cache, docs build job, SignalR job with `setup-dotnet`, `bun run bench` gate. Fix `SPECIFICATION.md` §17 browser claims.
5. Run all gates and the full three-browser e2e suite locally. Report to the owner. Merge to `main` only after the owner says yes.
6. After the merge to `main`: the owner imports the repo in Vercel.

## How to resume

- A stopped branch: `git worktree list`, open the worktree, read `plans/handoffs/<branch>.md` and `git log dev..HEAD`.
- A removed worktree: `git worktree add <path> <branch>`.
- Gates: see `AGENTS.md`.
