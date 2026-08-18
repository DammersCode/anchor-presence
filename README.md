# Anchor Presence

Anchor Presence is a live cursor system for DOM applications. It shows remote user cursors at the correct semantic position, even when clients render different layouts.

A remote cursor represents a semantic DOM location, not an absolute screen coordinate. A sender transmits a named anchor and a normalized position inside it. The receiver resolves that data against its own current layout. Semantic cursors survive different sidebars, breakpoints, wrapping, and element sizes, without any per-layout code.

## Features

- **Layout-independent positioning.** Cursors track a semantic anchor, not a pixel coordinate. A collapsed sidebar, a wrapped table, or a different viewport size does not break cursor placement.
- **Receiver-authoritative resolution.** Each client measures its own DOM. No client ever measures another client's screen.
- **Local repositioning without network traffic.** A scroll or resize on the receiver moves a stationary remote cursor for free.
- **Transport-agnostic.** Core imports no transport library. Bring your own WebSocket, Socket.IO, SignalR, or `BroadcastChannel` transport.
- **Framework adapter, not a framework requirement.** `core` and `dom` run without React. `@anchor-presence/react` is a thin adapter over `useSyncExternalStore`.
- **No required cursor component.** Rendering is fully consumer-controlled.
- **Validated, bounded input.** Every inbound message passes size and shape limits before it reaches application code.

## Monorepo layout

```text
packages/
  core/     @anchor-presence/core   protocol, validation, presence store, client orchestration
  dom/      @anchor-presence/dom    anchor registry, pointer capture, geometry scheduler, resolver
  react/    @anchor-presence/react  provider component, hooks
apps/
  demo/     React admin dashboard demonstrating cross-layout cursor correctness
  server/   Bun WebSocket relay for the demo
docs/       architecture, concepts, and per-topic guides
```

Dependency direction: `react → dom → core`. See `docs/architecture.md` for the full package boundary rules.

## Quickstart

Requires [Bun](https://bun.sh).

```sh
bun install
bun run build
```

Run the relay and the demo in two separate terminals:

```sh
# terminal 1: relay
cd apps/server
bun run dev

# terminal 2: demo
cd apps/demo
bun run dev
```

Open the demo URL in two browser windows. Give each window a distinct name so the cursors are easy to tell apart:

```text
http://localhost:5173/?name=Alice&room=main
http://localhost:5173/?room=main
```

Move the pointer in one window. The other window shows a live cursor tracking the same semantic location, even at a different window size or sidebar state.

## Packages

- [`packages/core`](packages/core/README.md) — protocol, validation, presence store, client orchestration
- [`packages/dom`](packages/dom/README.md) — anchor registry, pointer capture, geometry scheduler, resolver
- [`packages/react`](packages/react/README.md) — provider component and hooks

## Docs

- [`docs/architecture.md`](docs/architecture.md) — package layers, sender-to-receiver flow, the 10 invariants
- [`docs/concepts.md`](docs/concepts.md) — anchors, anchor IDs, normalized coordinates, fallback chains, resolution tiers
- [`docs/responsive-layouts.md`](docs/responsive-layouts.md) — how layout differences resolve, with a worked example
- [`docs/ui-context.md`](docs/ui-context.md) — opaque context, visibility policies, dialog mismatch handling
- [`docs/react.md`](docs/react.md) — provider and hook reference with examples
- [`docs/transports.md`](docs/transports.md) — the transport interface, plus WebSocket, Socket.IO, SignalR, and BroadcastChannel examples
- [`docs/codecs.md`](docs/codecs.md) — the codec interface, `jsonCodec`, a MessagePack sketch, and the validation boundary
- [`docs/performance.md`](docs/performance.md) — the geometry scheduler model and performance guidance
- [`docs/security.md`](docs/security.md) — validation limits, anchor ID safety, rendering rules
- [`docs/troubleshooting.md`](docs/troubleshooting.md) — common problems and their causes

See also [`SPECIFICATION.md`](SPECIFICATION.md) for the full technical specification.

## Development commands

```sh
bun install                # install workspace dependencies
bun run build               # build every package (tsc --build)
bun run typecheck            # tsc --build with no emit, core/dom/react
bun run test                 # unit tests (vitest)
bun run test:browser         # cross-layout browser tests (playwright)
```

Unit tests run through Vitest, never `bun test`; the two runners have different semantics. Cross-layout tests run through Playwright against Chromium, Firefox, and WebKit.
