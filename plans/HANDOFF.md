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

| Plan                                                        | Branch              | Worktree                        | Status                   |
| ----------------------------------------------------------- | ------------------- | ------------------------------- | ------------------------ |
| Agent rules, repo skills                                    | `dev`               | main tree                       | done (`4a0f916`)         |
| Plans cleanup and future backend plans                      | `dev`               | main tree                       | done (`697692f`)         |
| [022 Gap closure](022-gap-closure-2026-09-25.md) — packages | `package-gaps`      | `C:/repos/danny/ap-wt-packages` | in progress              |
| [023 Fumadocs docs site](023-fumadocs-docs-site.md)         | `docs-fumadocs`     | `C:/repos/danny/ap-wt-docs`     | done, merged (`3b17767`) |
| [024 Backend examples](024-backend-examples.md)             | `examples-backends` | `C:/repos/danny/ap-wt-backends` | done, merged (`0f451ff`) |
| 022 Gap closure — demo, e2e, CI                             | `dev`               | main tree                       | open (after merges)      |

Each branch keeps its own progress in `plans/handoffs/<branch>.md`. Read that file before you continue a branch.

## Docs site notes (from `docs-fumadocs`)

- Live `<Demo>` uses two iframes over a `BroadcastChannel` transport (`apps/docs/components/demo/`). One document cannot host two bindings: the pointer listener binds to `window`.
- The quick start's zero-backend sample uses `createInMemoryPair` (single realm).
- Code on example pages comes from repo files through `lib/read-example-source.ts`, so it cannot drift.
- Root `build` builds only `core`, `dom`, `react`. `bun run docs:build` builds the docs app.
- Open: run a full `simple-english` self-check pass over all pages.

## Backend examples notes (from `examples-backends`)

- `apps/demo` is the only demo client. `apps/demo/src/cursors/backends.ts` reads `?backend=` (or `VITE_BACKEND`). IDs and ports: `bun` = `apps/server` :8787 (default; e2e depends on it), `bun-native` :8788, `node-ws` :8789, `hono` :8790, `elysia` :8791, `socketio` :5001, `signalr` :5000.
- `examples/_shared/relay-guard.ts` holds the security baseline helpers for the four native-WebSocket relays.
- Hono uses `hono/bun`. Hono wraps each WebSocket event in a new `WSContext`, so room state keys off `ws.raw`.
- Bun native and Elysia use `ws.publish` (excludes the sender), not `server.publish`.
- `ws` closes the socket on `maxPayload`, so `node-ws` sets it high and drops oversized frames in app code.
- SignalR hub uses groups per room. `examples/signalr/signalr-hub.test.ts` runs the real hub and skips without `dotnet`.

## Next steps

1. Merge `package-gaps` into `dev` and fold its `plans/handoffs/package-gaps.md` into this file. (`docs-fumadocs` and `examples-backends` are merged.)
2. Demo fixes: WCAG AA label colors, `aria-live` on the presence pill, random default room.
3. E2E: in-place socket drop and reconnect; room isolation.
4. CI: `concurrency`, Bun cache, `setup-dotnet` 10.0.x so the SignalR hub test runs, `bun run bench` gate. (The docs build job exists.) Fix `SPECIFICATION.md` §17 browser claims.
5. Run all gates and the full three-browser e2e suite locally. Report to the owner. Merge to `main` only after the owner says yes.
6. After the merge to `main`: the owner imports the repo in Vercel.

## How to resume

- A stopped branch: `git worktree list`, open the worktree, read `plans/handoffs/<branch>.md` and `git log dev..HEAD`.
- A removed worktree: `git worktree add <path> <branch>`.
- Gates: see `AGENTS.md`.
