import { useEffect, useMemo, useRef, useState } from "react";
import { createPresenceClient, jsonCodec, noneInterpolator } from "@anchor-presence/core";
import type { PresenceClient } from "@anchor-presence/core";
import { createDomBinding } from "@anchor-presence/dom";
import type { DomBinding } from "@anchor-presence/dom";
import { createLoopbackTransport } from "./loopbackTransport";
import type { LoopbackTransport } from "./loopbackTransport";
import { BenchCell } from "./BenchCell";
import { RollingStats } from "./stats";

const ANCHOR_COUNTS = [10, 100, 1000] as const;
const CURSOR_COUNTS = [1, 10, 50, 100] as const;

type AnchorCount = (typeof ANCHOR_COUNTS)[number];
type CursorCount = (typeof CURSOR_COUNTS)[number];

function buildAnchorIds(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `bench.cell:${i}`);
}

function randomWalkStep(current: number, min: number, max: number): number {
  const next = current + (Math.random() - 0.5) * (max - min) * 0.2;
  return Math.min(max, Math.max(min, next));
}

/**
 * Wraps binding.subscribe with performance.now() to time each scheduler pass (spec §11's
 * READ+COMPUTE+NOTIFY, run synchronously inside one rAF callback). We run our own rAF loop to mark
 * "frame start", then measure how long after that mark the binding's notify fires — the delta is the
 * scheduler's READ+COMPUTE scripting cost for that pass, which is what the §16 budget (<2ms) targets.
 */
function useSchedulerPassStats(binding: DomBinding | null) {
  const [stats, setStats] = useState({ mean: 0, p95: 0, count: 0 });
  const rollingRef = useRef(new RollingStats());

  useEffect(() => {
    if (binding === null) return;
    const rolling = rollingRef.current;
    rolling.reset();

    let frameStartAt = performance.now();
    let rafHandle = requestAnimationFrame(function markFrameStart(ts) {
      frameStartAt = ts;
      rafHandle = requestAnimationFrame(markFrameStart);
    });

    const unsubscribe = binding.subscribe(() => {
      const elapsed = performance.now() - frameStartAt;
      if (elapsed >= 0) rolling.push(elapsed);
      setStats({ mean: rolling.mean(), p95: rolling.p95(), count: rolling.count });
    });

    return () => {
      cancelAnimationFrame(rafHandle);
      unsubscribe();
    };
  }, [binding]);

  return stats;
}

/** Client + binding + loopback transport, created once and torn down on unmount. */
function usePresenceHarness() {
  const [binding, setBinding] = useState<DomBinding | null>(null);
  const transportRef = useRef<LoopbackTransport | null>(null);

  useEffect(() => {
    const transport = createLoopbackTransport();
    const client: PresenceClient = createPresenceClient({ transport, maxRemoteClients: 200 });
    // interpolation off for the benchmark: measuring resolver/scheduler cost, not easing (spec §13)
    const created = createDomBinding(client, { interpolatorFactory: noneInterpolator });
    transportRef.current = transport;
    setBinding(created);
    return () => {
      created.dispose();
      client.dispose();
      transportRef.current = null;
    };
  }, []);

  return { binding, transportRef };
}

export function BenchPage() {
  const [anchorCount, setAnchorCount] = useState<AnchorCount>(100);
  const [cursorCount, setCursorCount] = useState<CursorCount>(10);
  const [running, setRunning] = useState(true);

  const anchorIds = useMemo(() => buildAnchorIds(anchorCount), [anchorCount]);
  const { binding, transportRef } = usePresenceHarness();
  const stats = useSchedulerPassStats(binding);

  // Simulate N remote cursors: build synthetic presence messages and inject them past the network boundary.
  useEffect(() => {
    if (!running || binding === null) return;
    const ids = anchorIds;
    if (ids.length === 0) return;

    type SimState = { clientId: string; session: string; sequence: number; anchorId: string; u: number; v: number };
    const sims: SimState[] = Array.from({ length: cursorCount }, (_, i) => ({
      clientId: `bench-${i}`,
      session: `s-${i}`,
      sequence: 0,
      anchorId: ids[i % ids.length]!,
      u: Math.random(),
      v: Math.random(),
    }));

    let rafHandle = 0;
    let lastPublish = 0;
    const publishIntervalMs = 50;

    function tick(timestampMs: number) {
      rafHandle = requestAnimationFrame(tick);
      if (timestampMs - lastPublish < publishIntervalMs) return;
      lastPublish = timestampMs;

      const transport = transportRef.current;
      if (transport === null) return;

      for (const sim of sims) {
        sim.u = randomWalkStep(sim.u, 0, 1);
        sim.v = randomWalkStep(sim.v, 0, 1);
        if (Math.random() < 0.02) sim.anchorId = ids[Math.floor(Math.random() * ids.length)]!;

        const message = {
          version: 1 as const,
          clientId: sim.clientId,
          session: sim.session,
          sequence: sim.sequence++,
          cursor: { anchors: [{ id: sim.anchorId, u: sim.u, v: sim.v }] },
          user: { name: sim.clientId, color: "#6366f1" },
        };
        transport.injectInbound(jsonCodec.encode(message));
      }
    }
    rafHandle = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafHandle);
  }, [running, binding, anchorIds, cursorCount, transportRef]);

  return (
    <div className="min-h-screen bg-gray-50 p-6 text-sm text-gray-900">
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <header>
          <h1 className="text-lg font-semibold">Anchor Presence — Benchmark</h1>
          <p className="text-gray-500">
            Scripted scenario per spec §16: N synthetic remote cursors moved every frame across M registered
            anchors. Numbers are scheduler NOTIFY-phase intervals (ms), not a stopwatch around app code.
          </p>
        </header>

        <div className="flex flex-wrap items-center gap-6 rounded-lg border border-gray-200 bg-white p-4">
          <label className="flex items-center gap-2">
            <span className="font-medium">Anchors</span>
            <select
              className="rounded-md border border-gray-300 px-2 py-1"
              value={anchorCount}
              onChange={(e) => setAnchorCount(Number(e.target.value) as AnchorCount)}
            >
              {ANCHOR_COUNTS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-2">
            <span className="font-medium">Cursors</span>
            <select
              className="rounded-md border border-gray-300 px-2 py-1"
              value={cursorCount}
              onChange={(e) => setCursorCount(Number(e.target.value) as CursorCount)}
            >
              {CURSOR_COUNTS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>

          <button
            className="rounded-md bg-indigo-600 px-3 py-1.5 font-medium text-white"
            onClick={() => setRunning((v) => !v)}
          >
            {running ? "Pause" : "Resume"}
          </button>

          <a href="?" className="ml-auto text-indigo-600 underline">
            Back to dashboard
          </a>
        </div>

        <div className="grid grid-cols-3 gap-4 rounded-lg border border-gray-200 bg-white p-4">
          <Stat label="Mean pass" value={`${stats.mean.toFixed(3)} ms`} />
          <Stat label="p95 pass" value={`${stats.p95.toFixed(3)} ms`} />
          <Stat label="Samples" value={String(stats.count)} />
        </div>

        <div
          className="grid gap-1 rounded-lg border border-gray-200 bg-white p-4"
          style={{ gridTemplateColumns: "repeat(auto-fill, minmax(1rem, 1fr))" }}
        >
          {anchorIds.map((id) => (
            <BenchCell key={id} anchorId={id} />
          ))}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-xs uppercase tracking-wide text-gray-400">{label}</span>
      <span className="text-xl font-semibold tabular-nums">{value}</span>
    </div>
  );
}
