# Anchor Presence Demo

[![MIT](https://img.shields.io/badge/license-MIT-blue.svg)](../../LICENSE)

A Vite + React admin dashboard that shows live remote cursors. Each cursor tracks a semantic element in your layout, not a raw screen coordinate.

The packages must be built before the demo runs.

```sh
bunx tsc --build packages/react   # also builds core and dom via project references
```

## Run it

```sh
bun install
bun run --cwd apps/server dev     # relay on :8787
bun run --cwd apps/demo dev       # vite dev server on :5173
```

Open two browser windows with different `?name=` values so you can tell the cursors apart.

```
http://localhost:5173/?name=Ari&room=demo
http://localhost:5173/?name=Bo&room=demo
```

Each window joins a random relay room unless you pass `?room=`. Open two windows with the same `?room=` value to see each other.

## What to try

- **Resize** either window. The remote cursor tracks the same element instead of drifting to a stale screen position.
- **Collapse the sidebar** in one window. The cursor over the sidebar in the other window stays in the right place.
- **Narrow the window** until the stats grid wraps to fewer columns. The cursor keeps tracking its card through the reflow.
- **Open Settings** in one window. In the other window, the cursor hides and an "in Settings" indicator appears in the topbar.
- Visit `/?page=bench` for the performance page. It uses synthetic cursors, no network.
- **Switch cursor motion** in Settings, or with `?interp=none|linear|spring`.

## Switching the relay backend

The demo picks its transport at runtime with `?backend=<id>` (or the `VITE_BACKEND` env var for a build-time default). The default, `bun`, is `apps/server` on port 8787.

| `?backend=`     | Server                            | Run it                                        |
| --------------- | --------------------------------- | --------------------------------------------- |
| `bun` (default) | `apps/server` (:8787)             | `bun run --cwd apps/server dev`               |
| `bun-native`    | `examples/bun-native` (:8788)     | `bun run --cwd examples/bun-native dev:relay` |
| `node-ws`       | `examples/node-ws` (:8789)        | `bun run --cwd examples/node-ws dev:relay`    |
| `hono`          | `examples/hono` (:8790)           | `bun run --cwd examples/hono dev:relay`       |
| `elysia`        | `examples/elysia` (:8791)         | `bun run --cwd examples/elysia dev:relay`     |
| `socketio`      | `examples/socketio` (:5001)       | `bun run --cwd examples/socketio dev:relay`   |
| `signalr`       | `examples/signalr/server` (:5000) | `cd examples/signalr/server && dotnet run`    |

For example, to try the Elysia backend:

```sh
bun run --cwd examples/elysia dev:relay
bun run --cwd apps/demo dev
```

Then open `http://localhost:5173/?backend=elysia` in two windows.
