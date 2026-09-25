# 027 Scale benchmark and how-it-works diagram

Status: in progress · Branch: `dev`

Owner decision (2026-09-25): add a benchmark for large rooms and a diagram for "How it works". A framework-free example is not needed.

## Scale benchmark

Status: done.

Persona review: the performance guide has no numbers for 50–200 clients per room or thousands of anchors.

- Receiver main thread: extended the demo bench page (`apps/demo/src/bench/bench-page.tsx`) with 500/2000-anchor and 200-cursor options. `e2e/perf-scale.spec.ts` is opt-in (`PERF_SCALE=1`, chromium only), measures 500×100, 1000×200, and 2000×200, prints a table, and asserts loose sanity bounds only. It is skipped (not run) in a normal `bunx playwright test`, so the gated `e2e/perf.spec.ts` (100×50) is the only perf spec in the default run.
- Relay: `scripts/relay-load.ts` starts `apps/server` directly (not through its `dev` script wrapper, so the sampled pid is the real worker) with room/socket caps raised via env, opens N native WebSocket clients in one room each publishing a real `binaryCodec` message at 20 Hz, and reports sent/delivered rate (measured, not the assumed rate — see the timer-drift note in the script's own output), latency p50/p99/p99.9, relay CPU/RSS, and WebSocket close codes (to distinguish a forced disconnect from the event loop falling behind). Run locally for 50/100/200 clients; not in CI.
- Core: added a `store.ingest steady-state: 200 clients` case to `packages/core/bench/hotpath.bench.ts`; only that key was added to `packages/core/bench/baseline.json`, the other entries are untouched.
- Docs: `get-started/guides/performance.mdx` has a "Measured at scale" section with both tables, the machine, and the reproduce commands. Replaced the sentence claiming no 200-client benchmark exists.

Finding: the reference relay's single-threaded event loop, not its rate-limit or slow-peer protections, is the bottleneck past ~100 clients in one room — CPU saturates near 100% and delivery latency grows into seconds, with zero forced disconnects (confirmed via close-code tracking in `relay-load.ts`).

## Diagram

Status: done.

- Owner choice: Mermaid. Diagrams are ` ```mermaid ` blocks in MDX, rendered by a client-side `Mermaid` component (Fumadocs Mermaid pattern), themed from the site tokens in light and dark. The LLM markdown keeps the Mermaid source as text.
- `get-started/concepts/how-it-works.mdx`: package layers (`@anchor-presence/react` → `dom` → `core`) and the message flow (pointer → anchor chain + normalized offset → transport → relay → receiver resolves against its own layout → cursor). Replaces the plain text box. Readable at 390 px, with a one-sentence text summary.
- Shipped: `apps/docs/components/mermaid.tsx` (client-only, lazy-loads `mermaid` v12, themes from `--color-fd-*` tokens plus the brand indigo/cyan accents, re-renders on `resolvedTheme` change, reserves height while loading, scrolls horizontally inside its own container instead of overflowing the page). `remarkMdxMermaid` from `fumadocs-core/mdx-plugins` is wired into `source.config.ts`; `lib/source.ts` converts the compiled `<Mermaid chart="...">` back into a fenced ` ```mermaid ` block for the `.md` LLM route.
