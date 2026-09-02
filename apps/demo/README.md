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
http://localhost:5173/?name=Ari
http://localhost:5173/?name=Bo
```

Both windows join the same relay room by default. Use `?room=` to use a different one.

## What to try

- **Resize** either window. The remote cursor tracks the same element instead of drifting to a stale screen position.
- **Collapse the sidebar** in one window. The cursor over the sidebar in the other window stays in the right place.
- **Narrow the window** until the stats grid wraps to fewer columns. The cursor keeps tracking its card through the reflow.
- **Open Settings** in one window. In the other window, the cursor hides and an "in Settings" indicator appears in the topbar.
- Visit `/?page=bench` for the performance page. It uses synthetic cursors, no network.
- **Switch cursor motion** in Settings, or with `?interp=none|linear|spring`.
