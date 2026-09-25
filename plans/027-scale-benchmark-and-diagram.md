# 027 Scale benchmark and how-it-works diagram

Status: in progress · Branch: `dev`

Owner decision (2026-09-25): add a benchmark for large rooms and a diagram for "How it works". A framework-free example is not needed.

## Scale benchmark

Persona review: the performance guide has no numbers for 50–200 clients per room or thousands of anchors.

- Receiver main thread: 200 remote cursors over 2000 registered anchors in Chromium, scripting time per resolve pass. Extend the existing perf e2e pattern (`e2e/perf.spec.ts`, the demo bench page). Keep the CI e2e run fast: the large scenario is opt-in (for example an env flag or a separate project) and runs locally.
- Relay: a local load script (`scripts/relay-load.ts`) that starts `apps/server` and N WebSocket clients (50, 100, 200) sending 20 messages per second with `binaryCodec`; it reports delivered messages per second, delivery latency p50/p99, and relay CPU. Local only, not in CI.
- Core: add a 200-client case to `scripts/bench.ts` and re-record the baseline for it only.
- Docs: a "Measured at scale" section in `get-started/guides/performance.mdx` with the numbers, the machine, and the commands to reproduce. Replace the sentence that says no such benchmark exists.

## Diagram

- A theme-aware SVG diagram component for `get-started/concepts/how-it-works.mdx`: package layers (`@anchor-presence/react` → `dom` → `core`) and the message flow (pointer → anchor chain + normalized offset → transport → relay → receiver resolves against its own layout → cursor). Replaces the plain text box. Readable in light and dark, at 390 px, with a text alternative.
