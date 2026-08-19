# Anchor Presence

Semantic live cursors for the DOM — different layouts, same meaning.

[![MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE) [![Agent skill](https://skills.sh/b/DammersCode/anchor-presence)](https://skills.sh)

```tsx
import { createPresenceClient } from "@anchor-presence/core";
import {
  LiveCursorProvider,
  useCursorAnchor,
  CursorLayer,
} from "@anchor-presence/react";

const client = createPresenceClient({ transport: myTransport });

function DashboardButton() {
  const anchorRef = useCursorAnchor("nav.dashboard");
  return <button ref={anchorRef}>Dashboard</button>;
}

function App() {
  return (
    <LiveCursorProvider client={client}>
      <DashboardButton />
      <CursorLayer />
    </LiveCursorProvider>
  );
}
```

A remote cursor tracks a named anchor and a normalized position inside it, not a screen coordinate. The receiver resolves that data against its own layout, so a collapsed sidebar, a wrapped table, or a different viewport size never breaks cursor placement.

## Packages

| Package | Description | Link |
|---|---|---|
| `@anchor-presence/core` | Protocol, validation, presence store, client orchestration. Zero dependencies, no DOM globals. | [`packages/core`](packages/core/README.md) |
| `@anchor-presence/dom` | Anchor registry, pointer capture, geometry scheduler, resolver. | [`packages/dom`](packages/dom/README.md) |
| `@anchor-presence/react` | Provider component and hooks, built on `useSyncExternalStore`. | [`packages/react`](packages/react/README.md) |
| `apps/demo` | React admin dashboard demonstrating cross-layout cursor correctness. | [`apps/demo`](apps/demo/README.md) |
| `apps/server` | Bun WebSocket relay for the demo. | [`apps/server`](apps/server) |

## Capability matrix

| Capability | React |
|---|---|
| Semantic anchors | ✅ |
| Fallback chains | ✅ |
| Viewport fallback | ✅ |
| UI context visibility policies (route- or dialog-aware, application-defined) | ✅ |
| Occlusion detection (clipped-ancestor + optional hit-test) | ✅ |
| Interpolation (`none`, `linear`; custom via `Interpolator`) | ✅ |
| Transport-agnostic (bring your own WebSocket, Socket.IO, SignalR, `BroadcastChannel`) | ✅ |
| SSR-safe hooks | ✅ |
| Mobile viewing (read-only presence) | ✅ |
| Mobile sending (touch as a pointer source) | not supported |

Only one framework adapter exists today. The matrix is structured to grow columns if a Svelte, Vue, or Solid adapter ships later; the owner has ruled that out for now.

## Minimum versions

| Requirement | Version |
|---|---|
| React (for `@anchor-presence/react`) | 18 or later |
| TypeScript | 5.9 or later |
| Browser | Evergreen. Requires `ResizeObserver`, `MutationObserver`, and pointer events. |
| Bun | Required to run the demo and the relay. |

## The Contract

```text
SENDER                                    RECEIVER
pointermove -> anchor ID + u/v      client.updateLocalCursor()
                    |                            |
                    v                            v
          codec.encode() -> transport.send() -> transport.subscribe()
                                                  |
                                                  v
                                    codec.decode() -> validatePresence()
                                                  |
                                                  v
                                    geometry scheduler: measure receiver's
                                    own anchor, resolve tier, interpolate
                                                  |
                                                  v
                                    ResolvedCursor { x, y, visible, tier }
```

The sender never measures the receiver's DOM. It sends a semantic anchor ID and a normalized position inside it. The receiver measures its own anchor and turns that into pixels. See `docs/architecture.md` for the full flow and the 10 invariants.

## Features

- **Layout-independent positioning.** Cursors track a semantic anchor, not a pixel coordinate. A collapsed sidebar, a wrapped table, or a different viewport size does not break cursor placement.
- **Receiver-authoritative resolution.** Each client measures its own DOM. No client measures another client's screen.
- **Local repositioning without network traffic.** A scroll or resize on the receiver moves a stationary remote cursor for free.
- **Transport-agnostic.** Core imports no transport library. Bring your own WebSocket, Socket.IO, SignalR, or `BroadcastChannel` transport.
- **Framework adapter, not a framework requirement.** `core` and `dom` run without React. `@anchor-presence/react` is a thin adapter over `useSyncExternalStore`.
- **Optional cursor components.** `@anchor-presence/react` ships `CursorLayer` and `DefaultCursor`. No cursor component is required; rendering stays consumer-controlled.
- **Validated, bounded input.** Every inbound message passes size and shape limits before it reaches application code.
- **Occlusion-aware.** The resolver detects when a clipping ancestor hides the resolved point, so a policy can hide a cursor that otherwise floats over empty space.
- **Measured performance.** The core inbound pipeline benches at roughly 300k messages per second. The geometry scheduler benches at roughly 1.3 ms mean per pass at 100 anchors and 50 cursors in the browser gate, against a 6 ms budget. See `docs/performance.md`.

## Pick by intent

**Resolution tier** — what the receiver shows for a resolved cursor:

| Tier | Use it when |
|---|---|
| `anchor` | The exact element, or a registered parent, exists on the receiver. Use this as the default; most cursors land here. |
| `viewport` | No anchor in the fallback chain resolved. Use it to keep a cursor visible on a page with no matching anchors. |
| `hidden` | Nothing resolved, or a visibility policy chose to hide the cursor. Use it to stop rendering entirely. |

**Visibility policy outcome** — what to return from a custom `VisibilityPolicy`:

| Outcome | Use it when |
|---|---|
| `"show"` (default at `anchor`/`viewport`) | Geometric resolution alone decides correctly. Use this for most UI. |
| `"hide"` on context mismatch | The sender's `context.dialog` names a dialog the receiver has not opened. Use this to avoid a misleading position. |
| `"hide"` on `!pointVisible` | A clipping ancestor hides the resolved point. Use this to stop a cursor floating over empty space. |

## Docs

- [`docs/architecture.md`](docs/architecture.md) — package layers, sender-to-receiver flow, the 10 invariants
- [`docs/concepts.md`](docs/concepts.md) — anchors, anchor IDs, normalized coordinates, fallback chains, resolution tiers
- [`docs/responsive-layouts.md`](docs/responsive-layouts.md) — how layout differences resolve, with a worked example
- [`docs/ui-context.md`](docs/ui-context.md) — opaque context, visibility policies, dialog mismatch handling
- [`docs/react.md`](docs/react.md) — provider and hook reference, custom interpolation, examples
- [`docs/transports.md`](docs/transports.md) — the transport interface, plus WebSocket, Socket.IO, SignalR, and BroadcastChannel examples
- [`docs/codecs.md`](docs/codecs.md) — the codec interface, `jsonCodec`, a MessagePack sketch, and the validation boundary
- [`docs/performance.md`](docs/performance.md) — the geometry scheduler model and performance guidance
- [`docs/security.md`](docs/security.md) — validation limits, anchor ID safety, rendering rules
- [`docs/troubleshooting.md`](docs/troubleshooting.md) — common problems and their causes

See also [`SPECIFICATION.md`](SPECIFICATION.md) for the full technical specification.

## Agent skill

AI coding agents can install the integration skill for this library:

```bash
npx skills add DammersCode/anchor-presence
```

The skill teaches an agent the anchor model, the integration steps, and the troubleshooting paths. The source is in [`skills/anchor-presence/`](skills/anchor-presence/).

## Quickstart

Requires [Bun](https://bun.sh).

```sh
bun install
bun run build
```

Run the relay and the demo in two separate terminals.

```sh
# terminal 1: relay
cd apps/server
bun run dev

# terminal 2: demo
cd apps/demo
bun run dev
```

Open the demo URL in two browser windows. Give each window a distinct name so the cursors are easy to tell apart.

```text
http://localhost:5173/?name=Alice&room=main
http://localhost:5173/?room=main
```

Move the pointer in one window. The other window shows a live cursor tracking the same semantic location, even at a different window size or sidebar state.

## Development commands

```sh
bun install                  # install workspace dependencies
bun run build                # build every package (tsc --build)
bun run typecheck             # tsc --build with no emit, core/dom/react
bun run test                  # unit tests (vitest)
bun run test:browser          # cross-layout browser tests (playwright)
```

Unit tests run through Vitest, never `bun test`; the two runners have different semantics. Cross-layout tests run through Playwright against Chromium, Firefox, and WebKit.

## Contributing

Read `docs/architecture.md` first for the package boundary rules, then `SPECIFICATION.md` for the full protocol. Open an issue or a pull request at [github.com/DammersCode/anchor-presence](https://github.com/DammersCode/anchor-presence).

MIT © DammersCode. See [LICENSE](LICENSE).
