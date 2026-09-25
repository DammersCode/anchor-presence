# Plans

This file is the index. Each row names a plan, its status, and one line about it.

Status values: **done** (shipped, no open work), **in progress** (work is happening now), **open** (not started or partly done).

## Shipped plans

These plans are done. The code, tests, and docs already show the result, so there is no plan body to keep.

| Plan                                                 | Status | Summary                                                                                                                                                                                                                                    |
| ---------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| CI workflow                                          | done   | GitHub Actions runs build, typecheck, lint, test, and Playwright on every push.                                                                                                                                                            |
| npm publish readiness                                | done   | MIT license and npm metadata added to all three packages.                                                                                                                                                                                  |
| Clipped-anchor occlusion detection                   | done   | `pointVisible` and the clip-ancestor walk let policies hide cursors over hidden content.                                                                                                                                                   |
| Pointer rect-cache reuse and bench scenarios         | done   | The pointer path reuses the scheduler's per-frame rect cache; the bench page gained resize and nested-scroll scenarios.                                                                                                                    |
| Dependency updates                                   | done   | jsdom, Vitest, Vite, and the React plugin updated; TypeScript stayed on 5.9 after a documented TS 7 blocker, then moved to 7.0.2 later.                                                                                                    |
| Socket.IO transport example and SignalR recipe check | done   | A tested Socket.IO example ships in `examples/socketio`; the SignalR doc recipe was checked and corrected.                                                                                                                                 |
| Demo interpolation style switcher                    | done   | The demo ships `none`, `linear`, and a demo-only `spring` interpolator behind a style switcher. The library still ships only `none` and `linear`.                                                                                          |
| README and docs restyle                              | done   | Root and package READMEs and docs pages moved to the house style, in Simplified Technical English.                                                                                                                                         |
| Performance verification                             | done   | Core and React adapter have budgeted, repeatable benchmarks and perf tests, wired into CI.                                                                                                                                                 |
| Configurable React cursor components                 | done   | `CursorLayer` and `DefaultCursor` ship in `@anchor-presence/react`; the demo cursor is a thin consumer of them.                                                                                                                            |
| Agent skill for skills.sh                            | done   | `skills/anchor-presence/` ships an installable agent skill for the library.                                                                                                                                                                |
| Architecture deepening                               | done   | Six seam and module-boundary fixes landed in `dom` and `react` (resolver interface, occlusion reader, options grouping, frame cache, selector hook, demo policy factory).                                                                  |
| VS Code reference navigation fix                     | done   | Root cause was a Welcome-page window, not the workspace. `.vscode/settings.json` and `.vscode/tasks.json` now pin the TypeScript version and exclude build output from search and the file watcher.                                        |
| Native WebSocket transport                           | done   | `createWebSocketTransport` ships in `@anchor-presence/dom` with reconnect and backoff; the demo consumes it instead of its own copy.                                                                                                       |
| `usePresenceClient` and `useRemoteUsers` hooks       | done   | Both hooks ship in `@anchor-presence/react`, covering client lifecycle across React Strict Mode and a simple online-users list.                                                                                                            |
| Anchor API cleanup                                   | done   | The `[data-anchor]` attribute is now the only public way to declare an anchor. The manual registry, `useCursorAnchor`, and the opt-in auto-register flag were removed before the first public release, per the data-attribute-only design. |
| Publishable ESM output                               | done   | Relative imports carry `.js` specifiers, `dist/` is cleaned on every build, and the package exports map supports Node's `node16` resolution.                                                                                               |
| Docs truth-up and quick start                        | done   | The README quick start connects a transport and compiles. Every doc sample matches the shipped API. Security docs list every relay limit and state that identity is unauthenticated.                                                       |
| Repo hygiene before public                           | done   | Internal working notes are gone from git. `SECURITY.md`, `CHANGELOG.md`, and a `packageManager` field were added.                                                                                                                          |
| API freeze fixes                                     | done   | Unexported option types are now exported, phantom generics are gone, `dispose()` disconnects the transport, and a second `connect()` call no longer orphans a socket.                                                                      |
| Release tooling                                      | done   | `npm version` runs the gate and syncs versions across packages; `release.yml` publishes core, dom, and react through npm trusted publishing on a tag push.                                                                                 |
| OSS readiness gate (2026-09-04 audit)                | done   | The audit that produced the five plans above. All five shipped; the repo is public-ready.                                                                                                                                                  |
| 025 Docs rework                                      | done   | Docs site reworked into the planned page tree per tab, links fixed, duplicated facts trimmed to one source, names unified, and every page passed the simple-english self-check.                                                            |

## In progress

| Plan                                                | Status      | Summary                                                                                               |
| --------------------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------- |
| Fumadocs docs site on Vercel                        | in progress | Replaces the GitHub Pages site in `site/` with a Fumadocs site deployed on Vercel.                    |
| Backend examples cleanup                            | in progress | Adds Bun-native, Node `ws`, Hono, and Elysia backend examples, and removes duplicate example clients. |
| [026 Example previews](026-example-previews.md)     | done        | One distinct live preview per example page, with guided tour and receiver insight.                    |
| [HANDOFF](HANDOFF.md)                               | in progress | Start here: program state, workstreams, next steps.                                                   |
| [023 Fumadocs docs site](023-fumadocs-docs-site.md) | done        | Spec for the docs site.                                                                               |
| [024 Backend examples](024-backend-examples.md)     | done        | Spec and security baseline for the backend examples.                                                  |
| [022 Gap closure](022-gap-closure-2026-09-25.md)    | done        | Closes the gaps from the 2026-09-25 advisor audit.                                                    |

## Future backends (planning only, not scheduled)

These plans describe backends the library does not ship today. They are reference material for later work, not a queue to start on.

| Plan                                                        | Status | Summary                                                                                         |
| ----------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------- |
| [Edge and serverless backends](backends/edge-serverless.md) | open   | Cloudflare Durable Objects with the WebSocket hibernation API, and PartyKit.                    |
| [Managed realtime backends](backends/managed-realtime.md)   | open   | Supabase Realtime Broadcast, Ably, and Pusher as transport carriers, with no server of our own. |
| [Other-language backends](backends/other-languages.md)      | open   | Go, Python, and Elixir relays, since the wire protocol is language-agnostic.                    |

## Future framework adapters (planning only, not scheduled)

| Plan                                                     | Status | Summary                                                                           |
| -------------------------------------------------------- | ------ | --------------------------------------------------------------------------------- |
| [Solid and Vue adapters](adapters/framework-adapters.md) | open   | `@anchor-presence/solid` and `@anchor-presence/vue`, mirroring the react adapter. |
