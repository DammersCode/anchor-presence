# Anchor Presence — Demo

A Vite + React admin dashboard that shows live remote cursors positioned by semantic DOM anchor
(`data-anchor` → `useCursorAnchor`), not by raw screen coordinates. See `SPECIFICATION.md` for the
full protocol.

This app consumes the built `dist/` output of `@anchor-presence/core`, `@anchor-presence/dom`, and
`@anchor-presence/react` (package `exports` point at `dist/`, not `src/`). Build those packages
before running the demo:

```sh
bunx tsc --build packages/react   # also builds core and dom via project references
```

## Run it

```sh
bun install
bun run --cwd apps/server dev     # relay on :8787
bun run --cwd apps/demo dev       # vite dev server on :5173
```

Open two browser windows with different `?name=` values so you can tell the cursors apart, e.g.:

```
http://localhost:5173/?name=Ari
http://localhost:5173/?name=Bo
```

Both windows join the same relay room by default (`?room=` to use a different one).

## What to try

- **Resize** either window and watch the remote cursor track the same semantic element instead of
  drifting to a stale screen coordinate.
- **Collapse the sidebar** in one window — the other window's cursor over `sidebar.*` elements stays
  correctly positioned even though the sidebar width changed underneath it.
- **Narrow the window** until the stats grid wraps to fewer columns — cursors over `stats.*` cards
  keep tracking their card through the reflow.
- **Open Settings** in one window. In the other window (without Settings open) the remote cursor
  disappears and an "in Settings" indicator appears next to that user's avatar in the topbar instead
  — the UI-context visibility policy from spec §12.
- Visit `/?page=bench` for the scripted performance page (synthetic cursors/anchors, no network).
