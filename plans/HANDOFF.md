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
| [022 Gap closure](022-gap-closure-2026-09-25.md) — packages | `package-gaps`      | `C:/repos/danny/ap-wt-packages` | done, merged (`ea778b4`) |
| [023 Fumadocs docs site](023-fumadocs-docs-site.md)         | `docs-fumadocs`     | `C:/repos/danny/ap-wt-docs`     | done, merged (`3b17767`) |
| [024 Backend examples](024-backend-examples.md)             | `examples-backends` | `C:/repos/danny/ap-wt-backends` | done, merged (`0f451ff`) |
| 022 Gap closure — demo, e2e, CI                             | `demo-e2e-ci`       | `C:/repos/danny/ap-wt-ci`       | done, merged             |

Each branch keeps its own progress in `plans/handoffs/<branch>.md`. Read that file before you continue a branch.

## Docs site notes (from `docs-fumadocs`)

- Live `<Demo>` uses two iframes over a `BroadcastChannel` transport (`apps/docs/components/demo/`). One document cannot host two bindings: the pointer listener binds to `window`.
- The quick start's zero-backend sample uses `createInMemoryPair` (single realm).
- Code on example pages comes from repo files through `lib/read-example-source.ts`, so it cannot drift.
- Root `build` builds only `core`, `dom`, `react`. `bun run docs:build` builds the docs app.
- Open: run a full `simple-english` self-check pass over all pages.

### Root-folder tabs (from the tab-switcher restructure)

- `content/docs` now has five Fumadocs root folders (`meta.json` with `"root": true`, `icon`, `description`), giving the sidebar a tab switcher like fumadocs.dev: `get-started` ("Anchor Presence"), `core` (`@anchor-presence/core`), `dom` (`@anchor-presence/dom`), `react` (`@anchor-presence/react`), `examples`.
- URLs moved to `/docs/<tab>/<page>`. `core`, `dom`, `react` each have an `index.mdx` overview page; `get-started` and `examples` do not, so `next.config.mjs` redirects their bare tab URL to a real page (`/docs/get-started` to `introduction`, `/docs/examples` to `basics`). A root folder with no `index.mdx` 404s at its own bare URL; add one or a redirect for any new tab.
- `lib/source.ts` resolves `meta.json`'s `icon` string through a small `icons` map (`lucide-react`) passed to `loader({ icon })`.
- Every old `/docs/getting-started/*`, `/docs/concepts/*`, `/docs/guides/*`, `/docs/reference/*` URL has a permanent redirect in `next.config.mjs`. `/docs/examples/*` did not move.
- The new `/docs/core/build-a-framework-adapter` page documents the provider/hook mechanics future Solid and Vue adapters need; see `plans/adapters/framework-adapters.md` for the adapter plan itself.
- Top nav gained "Docs" and "Examples" links (`lib/layout.shared.tsx`); the home page gained an "Examples" button next to "Read the docs".

## Backend examples notes (from `examples-backends`)

- `apps/demo` is the only demo client. `apps/demo/src/cursors/backends.ts` reads `?backend=` (or `VITE_BACKEND`). IDs and ports: `bun` = `apps/server` :8787 (default; e2e depends on it), `bun-native` :8788, `node-ws` :8789, `hono` :8790, `elysia` :8791, `socketio` :5001, `signalr` :5000.
- `examples/_shared/relay-guard.ts` holds the security baseline helpers for the four native-WebSocket relays.
- Hono uses `hono/bun`. Hono wraps each WebSocket event in a new `WSContext`, so room state keys off `ws.raw`.
- Bun native and Elysia use `ws.publish` (excludes the sender), not `server.publish`.
- `ws` closes the socket on `maxPayload`, so `node-ws` sets it high and drops oversized frames in app code.
- SignalR hub uses groups per room. `examples/signalr/signalr-hub.test.ts` runs the real hub and skips without `dotnet`.

## Package gap notes (from `package-gaps`)

- Reduced motion: `createDomBinding` defaults to `noneInterpolator` when `prefers-reduced-motion: reduce` matches (checked lazily, SSR-safe). An explicit `interpolatorFactory` wins.
- Idle: `idleAfterMs` (default `DEFAULT_IDLE_AFTER_MS` = 15 s, clamped below `staleTimeoutMs`). Exposed as `RemotePresence.idle`, `ResolvedCursor.idle`, `RemoteUser.idle`. `CursorLayer` dims idle cursors.
- Off-screen flag: not added. Spec §10 resolves off-screen anchors on purpose; apps compare `x`/`y` with the viewport (documented in troubleshooting).
- Benchmarks: `bun run bench` (`scripts/bench.ts`, tinybench) against `packages/core/bench/baseline.json`, tolerance × 3, `-- --update-baseline`.
- SignalR hub test builds once with `dotnet build -o <tmp>` and runs the dll directly (`dotnet run` orphans a child process on kill).

## Demo, e2e, and CI notes (from `demo-e2e-ci`)

- Demo palette lives in `apps/demo/src/cursors/palette.ts` (Tailwind ~700 shades, all ≥ 5:1 against white). `contrast.test.ts` guards it.
- The demo picks a random room when `?room=` is missing. Pair e2e tests always pass a room.
- `e2e/resilience.spec.ts`: socket drop through `page.routeWebSocket` + `connectToServer()`, closing only the client side, so the real backoff path runs. Room isolation uses a third page.
- CI: `concurrency` per ref, Bun cache, `setup-dotnet` 10.0.x (SignalR hub test runs), docs job with `.next/cache`, non-blocking `bun run bench`.
- `SPECIFICATION.md` §17 lists which e2e specs run in three browsers (`cross-layout.spec.ts`) and which run in Chromium only.

## Next steps

1. Owner review. Merge `dev` into `main` only after the owner says yes.
2. After the merge: the owner imports the repo in Vercel (Root Directory `apps/docs`).
3. After the first CI runs on `main`: re-record the bench baseline on CI hardware (`bun run bench -- --update-baseline`) and make the bench step blocking.
4. Run a full `simple-english` self-check pass over the docs pages.
5. Future backends: `plans/backends/`.
6. Future framework adapters (Solid, Vue): `plans/adapters/framework-adapters.md`.

## How to resume

- All 2026-09-25 worktrees are merged and removed. For new parallel work, branch worktrees from `dev`.
- A removed worktree: `git worktree add <path> <branch>`.
- Gates: see `AGENTS.md`.
