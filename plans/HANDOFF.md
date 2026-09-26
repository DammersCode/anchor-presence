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

| Plan                                                                                    | Branch              | Worktree                        | Status                   |
| --------------------------------------------------------------------------------------- | ------------------- | ------------------------------- | ------------------------ |
| Agent rules, repo skills                                                                | `dev`               | main tree                       | done (`4a0f916`)         |
| Plans cleanup and future backend plans                                                  | `dev`               | main tree                       | done (`697692f`)         |
| [022 Gap closure](022-gap-closure-2026-09-25.md) — packages                             | `package-gaps`      | `C:/repos/danny/ap-wt-packages` | done, merged (`ea778b4`) |
| [023 Fumadocs docs site](023-fumadocs-docs-site.md)                                     | `docs-fumadocs`     | `C:/repos/danny/ap-wt-docs`     | done, merged (`3b17767`) |
| [024 Backend examples](024-backend-examples.md)                                         | `examples-backends` | `C:/repos/danny/ap-wt-backends` | done, merged (`0f451ff`) |
| 022 Gap closure — demo, e2e, CI                                                         | `demo-e2e-ci`       | `C:/repos/danny/ap-wt-ci`       | done, merged             |
| 025 Docs rework                                                                         | `dev`               | main tree                       | done                     |
| [026 Example previews](026-example-previews.md)                                         | `dev`               | main tree                       | done                     |
| [027 Scale benchmark and diagram](027-scale-benchmark-and-diagram.md) — scale benchmark | `dev`               | main tree                       | done                     |
| [028 Layout audit skill](028-layout-audit-skill.md)                                     | `dev`               | main tree                       | done                     |
| Skills docs tab                                                                         | `dev`               | main tree                       | done                     |

Each branch keeps its own progress in `plans/handoffs/<branch>.md`. Read that file before you continue a branch.

## Skills docs tab notes

- New Fumadocs root folder `content/docs/skills/` (icon `bot`, registered in `lib/source.ts`), last in the tab switcher: `index.mdx` (Overview), `integration.mdx`, `layout-audit.mdx`. Each skill page follows a fixed section order (What it does, When to reach for it, Prerequisites, What it asks you, How it works, Common questions, It's working if, Where it fits).
- `get-started/guides/ai-agents.mdx` is gone: its content moved into `skills/index.mdx` (one fact in one place). Every internal link now points at `/docs/skills` or `/docs/skills/layout-audit`; `layout-design.mdx` and `README.md` were the two source files with a stale link.
- Home page (`app/(home)/layout.tsx`, `page.tsx`): "Skills" added to the header nav next to Docs and Examples; the hero's "Your AI agent can wire it up too" block gained one line covering both skills, linking to `/docs/skills`. Kept short (`text-xs`, tight top margin).
- All gates green (`typecheck`, `lint`, `format:check`, `apps/docs build`); `llms.txt` lists the three new Skills pages; screenshots taken with `agent-browser` at 1440/390 px and light/dark for the home page and all three skills pages.

## Skill review and evals notes

- Both shipped skills were reviewed against the Anthropic skill docs, skill-creator, the agentskills.io spec, and superpowers `writing-skills`. Both pass skill-creator `quick_validate.py` and `agentskills validate` (PyPI `skills-ref`). The sources disagree on description style and length; we follow Anthropic (third person, what plus when, under 500 lines).
- Evals live in `test/skill-evals/*.json` (skill-creator format), outside the skill folders so the installer does not ship them. Run each with and without the skill in a scratch fixture; install the packages from `npm pack` tarballs.
- First run (2026-09-26): the integration skill and the docs-only baseline both finished eval 1 end to end; the skill run surfaced the relay copy and start gaps now covered in `transports.md`. The audit skill finished eval 1 on `apps/demo` (16/16 views, 56 pairs).
- `packages/react/test/skill-samples.test.tsx` type-checks the `SKILL.md` tsx samples and fails when they drift.
- `.agents/skills/simple-english` has `metadata.internal: true`, so `npx skills add DammersCode/anchor-presence` offers only the two library skills.

## Layout audit notes (028)

- `skills/anchor-presence-audit/` ships to library users next to `skills/anchor-presence/`. The scripts are plain Node ESM with one dependency, `playwright`. `measure.mjs` resolves it from the current directory first, then from the skill folder, and accepts `@playwright/test` too (this repo has only `@playwright/test`).
- `scripts/score.mjs` is pure and unit-tested (`test/audit-skill/score.test.mjs`). `measure.mjs` passes `collectInPage` to `page.evaluate`, so that function must stay self-contained.
- Dogfood: `plans/research/presence-layout-audit-dogfood.config.json` scores the docs example scenes through `/demo-frame/<scene>/<layout>` on the docs dev server (:3001). Rerun it after a scene changes; the report is `plans/research/presence-layout-audit-dogfood.md`.
- The total is `max(weighted sum, Jump, Gap)`, so a visible jump or gap is never diluted to moderate. Every reflow scene in the dogfood run scores 100 (jumps over 240 px in 317 px panes); a viewport-relative jump threshold is the follow-up once real apps are audited.

## Scale benchmark notes (027)

- Receiver: the demo bench page (`apps/demo/src/bench/bench-page.tsx`) now offers 500 and 2000 anchors and 200 cursors. `e2e/perf-scale.spec.ts` is opt-in (`PERF_SCALE=1`, chromium only) and measures 500×100, 1000×200, 2000×200; it is skipped in a normal `bunx playwright test`, so it adds no CI time.
- Relay: `scripts/relay-load.ts` spawns `apps/server/index.ts` directly, not through its `dev` package script — `bun run --cwd apps/server dev` re-execs a child process, which would make CPU/RSS sampling read the wrong pid. Room/socket caps are raised via env for the client count under test; the rate limit stays at the shipped default.
- Timer drift: on this Windows/Bun setup, `setInterval(fn, 50)` (20 Hz) can run under its nominal rate under load. `relay-load.ts` measures the rate clients actually achieved and reports delivery against that, plus the nominal-rate figure for reference, rather than asserting a fixed target.
- Finding: past ~100 clients in one room, the reference relay's own single-threaded event loop saturates its CPU (near 100%) and delivery latency grows into seconds — confirmed via WebSocket close-code tracking that zero sockets were force-closed by the slow-peer or rate-limit protections. The bottleneck is CPU, not those protections.
- Core: `packages/core/bench/hotpath.bench.ts` gained a `store.ingest steady-state: 200 clients` case; `baseline.json` got only that one new key, the rest are untouched.
- Docs: `get-started/guides/performance.mdx` "Measured at scale" section has both tables, the machine spec, and reproduce commands.

## Example previews notes (026)

- Every example page embeds `<ExamplePreview scene="..." />`: two iframes (`/demo-frame/<scene>/<layout>`) on one `BroadcastChannel`, plus a control channel (`<channel>:control`) for tour state, reader input, and visibility. The home hero and quick start keep `<Demo />` (scene `home` on the same route).
- Scene files (`components/examples/<scene>.tsx`) are the code the page shows. Keep plumbing out of them: a scene takes `client`, `layout`, and `children` (the status bar), and owns its `LiveCursorProvider` and `CursorLayer`.
- The tour runs only in the wide pane: each track is a real presence client (`clientId` `tour-<name>`, one-hour heartbeat so a `quiet` step goes idle). It builds anchor chains from the DOM like the binding does. It pauses on reader input (resumes after 4 s), when the preview leaves the viewport (parent `IntersectionObserver`), when the tab is hidden, and on the Pause button. Under reduced motion it jumps instead of gliding.
- To add a scene: write the scene file, add it to `SCENE_COMPONENTS`, add captions and a tour to `SCENES`, and embed `<ExamplePreview scene="..." />`. Tour anchors must exist in the wide layout.
- Dev server caveat: moving `app/demo-frame/[variant]` to `[scene]/[layout]` broke the running `next dev` route table ("different slug names for the same dynamic path"). After that, it served no new dynamic route. Restart `next dev` once after pulling this change.

## Docs rework notes (025, whole-site QA pass)

Final structure: five tabs (`get-started`, `core`, `dom`, `react`, `examples`), each a Fumadocs root folder with its own `meta.json`, sidebar groups, and an "API reference" group at the end where the tab has one. Every page has frontmatter `title`/`description`, an intro paragraph, and a `## Related` section. No page is titled with a bare package name; every folder index page is titled "Overview".

- Fixed about 25 stale internal links left over from the tab restructure and the `get-started` guide/concept split: `/docs/get-started/security` to `/docs/get-started/guides/security`, `/docs/get-started/concepts/architecture` to `/docs/get-started/concepts/how-it-works`, `/docs/get-started/concepts/anchors-and-fallbacks` to `/docs/get-started/concepts/anchors`, and two stale `/docs/react#...` anchors in `examples/` pages to the real split-out pages (`react/custom-cursors`, `dom/motion`).
- Removed duplicated facts across tabs: the resolution-tier table and viewport pixel formulas now live only on `/docs/dom/resolution`; the occlusion ancestor-walk mechanism and its `clippedPointPolicy` sample live only on `/docs/dom/occlusion-and-scroll`; the `ValidationLimits` table lives only on `/docs/get-started/guides/security`; the `maxRemoteClients` drop mechanism lives only on `/docs/core/remote-presence`. Concept pages (`get-started/concepts/*`) now link to the DOM/core pages instead of restating the mechanics.
- Unified naming: fixed "Core"/"core" and "Dom"/"React" case mismatches next to each other in `core/index.mdx`, `get-started/concepts/how-it-works.mdx`, `README.md`, and `packages/react/README.md` (the exact inconsistency the owner flagged). House style for an unscoped package reference in prose is the lowercase code-formatted short name (`` `core` ``, `` `dom` ``, `` `react` ``), consistent with the majority of existing pages.
- Added a "Cursor jumps between two elements" symptom to `get-started/guides/troubleshooting.mdx`.
- Trimmed `get-started/concepts/how-it-works.mdx` from 135 to 119 lines (merged the package-layer bullet list with the per-package subsections) — no other page is over 120 lines.
- All gates green: `format`, `format:check`, `lint`, `typecheck`, `test` (458/458), `docs:build` (206 static pages) alongside the running dev server.

## Docs site notes (from `docs-fumadocs`)

- Live `<Demo>` uses two iframes over a `BroadcastChannel` transport (`apps/docs/components/demo/`). One document cannot host two bindings: the pointer listener binds to `window`.
- The quick start's zero-backend sample uses `createInMemoryPair` (single realm).
- Code on example pages comes from repo files through `lib/read-example-source.ts`, so it cannot drift.
- Root `build` builds only `core`, `dom`, `react`. `bun run docs:build` builds the docs app.

### Root-folder tabs (from the tab-switcher restructure)

- `content/docs` now has five Fumadocs root folders (`meta.json` with `"root": true`, `icon`, `description`), giving the sidebar a tab switcher like fumadocs.dev: `get-started` ("Anchor Presence"), `core` (`@anchor-presence/core`), `dom` (`@anchor-presence/dom`), `react` (`@anchor-presence/react`), `examples`.
- URLs moved to `/docs/<tab>/<page>`. `core`, `dom`, `react` each have an `index.mdx` overview page; `get-started` and `examples` do not, so `next.config.mjs` redirects their bare tab URL to a real page (`/docs/get-started` to `introduction`, `/docs/examples` to `basics`). A root folder with no `index.mdx` 404s at its own bare URL; add one or a redirect for any new tab.
- `lib/source.ts` resolves `meta.json`'s `icon` string through a small `icons` map (`lucide-react`) passed to `loader({ icon })`.
- `next.config.mjs` redirects only the three bare tab URLs (`/docs`, `/docs/get-started`, `/docs/examples`) to a real page. There is no redirect for old `/docs/getting-started/*`, `/docs/concepts/*`, `/docs/guides/*`, or `/docs/reference/*` URLs: a page moved under the tab restructure or the 2026-09-25 rework 404s directly if a link still points at its old path. Grep the whole repo for a moved slug before renaming or removing a page.
- The new `/docs/core/build-a-framework-adapter` page documents the provider/hook mechanics future Solid and Vue adapters need; see `plans/adapters/framework-adapters.md` for the adapter plan itself.
- Top nav gained "Docs" and "Examples" links (`lib/layout.shared.tsx`); the home page gained an "Examples" button next to "Read the docs".

## Backend examples notes (from `examples-backends`)

- `apps/demo` is the only demo client. `apps/demo/src/cursors/backends.ts` reads `?backend=` (or `VITE_BACKEND`). IDs and ports: `bun` = `apps/server` :8787 (default; e2e depends on it), `bun-native` :8788, `node-ws` :8789, `hono` :8790, `elysia` :8791, `socketio` :5001, `signalr` :5000.
- `examples/_shared/relay-guard.ts` holds the security baseline helpers for the four native-WebSocket relays.
- Hono uses `hono/bun`. Hono wraps each WebSocket event in a new `WSContext`, so room state keys off `ws.raw`.
- Bun native and Elysia use `ws.publish` (excludes the sender), not `server.publish`.
- `ws` closes the socket on `maxPayload`, so `node-ws` sets it high and drops oversized frames in app code.
- SignalR hub uses groups per room. `examples/signalr/signalr-hub.test.ts` runs the real hub and skips without `dotnet`.
- `examples/signalr/transport.ts`'s `createSignalRTransport` takes a plain `@microsoft/signalr` `HubConnection`, not a `use-signalr` harness; the example has no `@dammers/use-signalr-react` dependency. The docs page's "Already using use-signalr?" section covers building the transport on that provider's connection instead.

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
- CI (split to save minutes, no check runs twice): `pr.yml` on owner PRs = build, typecheck, format, lint, unit tests; `main.yml` on push to main = .NET hub test, bench (3×), demo build, chromium e2e, docs build, one job; pushes to `dev` run nothing; `release.yml` waits for the tagged commit's green Main checks instead of rerunning them. Runners pinned to `ubuntu-24.04`.
- `SPECIFICATION.md` §17 lists which e2e specs run in three browsers (`cross-layout.spec.ts`) and which run in Chromium only.

## Release prep notes (2026-09-26)

- `dev` merged into `main` through PR #1 (merge commit `99663e9`). First real runs: `pr.yml` green in 2 min, `main.yml` green in 4 min.
- Owner decisions: keep the tab switcher as it is (dropdown at the sidebar top); no Next.js dev indicator (`devIndicators: false`); no framework adapters or new backends for now.
- Example relays meet the whole relay baseline: `RELAY_MAX_TOTAL_SOCKETS` (same name as `apps/server`), `RELAY_IDLE_TIMEOUT_SECONDS` ping/pong, and the Bun relays close slow receivers at `RELAY_SLOW_PEER_HARD_BYTES` via `closeOnBackpressureLimit`.
- Audit skill: optional `"jumpScale": "viewport"`.
- Evals 1–3 of the integration skill and eval 1 of the audit skill pass. skill-creator's trigger eval (`run_eval.py`) does not run on Windows (`select` on a pipe); the descriptions were assessed by hand.
- Accessibility: demo has zero axe violations (`e2e/a11y.spec.ts`). Open, owner's call: the light code theme (`github-light`) has one token color at 3.48:1; `github-light-high-contrast` would fix it.
- `CHANGELOG.md` has `## 0.1.0 - 2026-09-26`. No tag yet: a `v*` tag runs `release.yml`, which publishes to npm.

## Next steps

1. Owner: import the repo in Vercel (Root Directory `apps/docs`).
2. Owner decides when to publish: `npm version` pushes the commit and a `v*` tag; `release.yml` waits for a green `main.yml` run on that SHA.
3. Future backends: `plans/backends/`. Future framework adapters (Solid, Vue): `plans/adapters/framework-adapters.md`.

## How to resume

- All 2026-09-25 worktrees are merged and removed. For new parallel work, branch worktrees from `dev`.
- A removed worktree: `git worktree add <path> <branch>`.
- Gates: see `AGENTS.md`.
