import { useEffect, useMemo, useRef, useState } from "react";
import { createPresenceClient, jsonCodec, noneInterpolator } from "@anchor-presence/core";
import type { PresenceClient } from "@anchor-presence/core";
import { createDomBinding } from "@anchor-presence/dom";
import type { DomBinding } from "@anchor-presence/dom";
import { createLoopbackTransport } from "./loopback-transport";
import type { LoopbackTransport } from "./loopback-transport";
import { BenchCell } from "./bench-cell";
import { RollingStats } from "./stats";

// ?nostats skips all stats DOM work so a measurement run re-renders nothing
const STATS_ENABLED = !new URLSearchParams(window.location.search).has("nostats");

const ANCHOR_COUNTS = [10, 100, 500, 1000, 2000] as const;
const CURSOR_COUNTS = [1, 10, 50, 100, 200] as const;

declare global {
  interface Window {
    benchStats?: {
      mean: number;
      p95: number;
      count: number;
      stormMean: number;
      stormP95: number;
      stormCount: number;
    };
  }
}

type AnchorCount = (typeof ANCHOR_COUNTS)[number];
type CursorCount = (typeof CURSOR_COUNTS)[number];

function buildAnchorIds(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `bench.cell:${i}`);
}

function randomWalkStep(current: number, min: number, max: number): number {
  const next = current + (Math.random() - 0.5) * (max - min) * 0.2;
  return Math.min(max, Math.max(min, next));
}

const STORM_DURATION_MS = 5000;

// frame-start → notify delta = the scheduler's per-pass scripting cost (§16 <2ms budget)
// stormActive routes each sample into a separate rolling window so storm-phase cost is visible on its own
function useSchedulerPassStats(binding: DomBinding | null, stormActive: boolean, statsEnabled: boolean) {
  const [stats, setStats] = useState({ mean: 0, p95: 0, count: 0 });
  const [stormStats, setStormStats] = useState({ mean: 0, p95: 0, count: 0 });
  const rollingRef = useRef(new RollingStats());
  const stormRollingRef = useRef(new RollingStats());
  const stormActiveRef = useRef(stormActive);
  stormActiveRef.current = stormActive;

  useEffect(() => {
    if (stormActive) stormRollingRef.current.reset();
  }, [stormActive]);

  useEffect(() => {
    if (binding === null) return;
    const rolling = rollingRef.current;
    const stormRolling = stormRollingRef.current;
    rolling.reset();

    let frameStartAt = performance.now();
    let rafHandle = requestAnimationFrame(function markFrameStart(ts) {
      frameStartAt = ts;
      rafHandle = requestAnimationFrame(markFrameStart);
    });

    // The readout publishes at 1 Hz, outside the measured pass. In nostats mode it only writes
    // window.benchStats, so the notify callback below does nothing but push one sample.
    const publishToPage = () => {
      if (statsEnabled) {
        setStats({ mean: rolling.mean(), p95: rolling.p95(), count: rolling.count });
        setStormStats({ mean: stormRolling.mean(), p95: stormRolling.p95(), count: stormRolling.count });
      } else {
        window.benchStats = {
          mean: rolling.mean(),
          p95: rolling.p95(),
          count: rolling.count,
          stormMean: stormRolling.mean(),
          stormP95: stormRolling.p95(),
          stormCount: stormRolling.count,
        };
      }
    };
    const refreshHandle = window.setInterval(publishToPage, 1000);

    const unsubscribe = binding.subscribe(() => {
      const elapsed = performance.now() - frameStartAt;
      if (elapsed < 0) return;
      if (stormActiveRef.current) {
        stormRolling.push(elapsed);
      } else {
        rolling.push(elapsed);
      }
    });

    return () => {
      cancelAnimationFrame(rafHandle);
      window.clearInterval(refreshHandle);
      if (!statsEnabled) window.benchStats = undefined;
      unsubscribe();
    };
  }, [binding, statsEnabled]);

  return { stats, stormStats };
}

/** Oscillates a container's width between 60% and 100% via rAF for STORM_DURATION_MS, then stops. */
function useResizeStorm(active: boolean, containerRef: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    if (!active) return;
    const el = containerRef.current;
    if (el === null) return;
    const startedAt = performance.now();
    let rafHandle = 0;

    function tick(ts: number) {
      const elapsed = ts - startedAt;
      if (elapsed >= STORM_DURATION_MS || el === null) {
        if (el !== null) el.style.width = "";
        return;
      }
      const phase = (Math.sin((elapsed / 1000) * Math.PI * 2) + 1) / 2; // 0..1 oscillation, ~1s period
      const widthPct = 60 + phase * 40; // 60%..100%
      el.style.width = `${widthPct}%`;
      rafHandle = requestAnimationFrame(tick);
    }
    rafHandle = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafHandle);
      if (el !== null) el.style.width = "";
    };
  }, [active, containerRef]);
}

const NESTED_SCROLL_PERIOD_MS = 900;

/** Sawtooth auto-scrolls the inner scrollable box via rAF for STORM_DURATION_MS, then stops. */
function useNestedScroll(active: boolean, innerRef: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    if (!active) return;
    const el = innerRef.current;
    if (el === null) return;
    const startedAt = performance.now();
    let rafHandle = 0;

    function tick(ts: number) {
      const elapsed = ts - startedAt;
      if (elapsed >= STORM_DURATION_MS || el === null) return;
      const max = el.scrollHeight - el.clientHeight;
      const phase = (elapsed % NESTED_SCROLL_PERIOD_MS) / NESTED_SCROLL_PERIOD_MS; // 0..1 sawtooth
      el.scrollTop = max > 0 ? phase * max : 0;
      rafHandle = requestAnimationFrame(tick);
    }
    rafHandle = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(rafHandle);
  }, [active, innerRef]);
}

/** Client + binding + loopback transport, created once and torn down on unmount. */
function usePresenceHarness() {
  const [binding, setBinding] = useState<DomBinding | null>(null);
  const transportRef = useRef<LoopbackTransport | null>(null);

  useEffect(() => {
    const transport = createLoopbackTransport();
    const client: PresenceClient = createPresenceClient({ transport, maxRemoteClients: 200 });
    // interpolation off for the benchmark: measuring resolver/scheduler cost, not easing (spec §13)
    const created = createDomBinding(client, { resolution: { interpolatorFactory: noneInterpolator } });
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
  const [stormActive, setStormActive] = useState(false);
  const [nestedScrollActive, setNestedScrollActive] = useState(false);

  const anchorIds = useMemo(() => buildAnchorIds(anchorCount), [anchorCount]);
  const { binding, transportRef } = usePresenceHarness();
  const { stats, stormStats } = useSchedulerPassStats(
    binding,
    stormActive || nestedScrollActive,
    STATS_ENABLED,
  );

  const gridRef = useRef<HTMLDivElement | null>(null);
  const nestedScrollInnerRef = useRef<HTMLDivElement | null>(null);
  useResizeStorm(stormActive, gridRef);
  useNestedScroll(nestedScrollActive, nestedScrollInnerRef);

  function startStorm() {
    setStormActive(true);
    setTimeout(() => setStormActive(false), STORM_DURATION_MS);
  }
  function startNestedScroll() {
    setNestedScrollActive(true);
    setTimeout(() => setNestedScrollActive(false), STORM_DURATION_MS);
  }

  // Simulate N remote cursors: build synthetic presence messages and inject them past the network boundary.
  useEffect(() => {
    if (!running || binding === null) return;
    const ids = anchorIds;
    if (ids.length === 0) return;

    type SimState = {
      clientId: string;
      session: string;
      sequence: number;
      anchorId: string;
      u: number;
      v: number;
    };
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

          <button
            className="rounded-md bg-amber-600 px-3 py-1.5 font-medium text-white disabled:opacity-50"
            onClick={startStorm}
            disabled={stormActive || nestedScrollActive}
          >
            {stormActive ? "Resize storm running…" : "Resize storm (5s)"}
          </button>

          <button
            className="rounded-md bg-teal-600 px-3 py-1.5 font-medium text-white disabled:opacity-50"
            onClick={startNestedScroll}
            disabled={stormActive || nestedScrollActive}
          >
            {nestedScrollActive ? "Nested scroll running…" : "Nested scroll (5s)"}
          </button>

          <a href="?" className="ml-auto text-indigo-600 underline">
            Back to dashboard
          </a>
        </div>

        {STATS_ENABLED ? (
          <>
            <div className="grid grid-cols-3 gap-4 rounded-lg border border-gray-200 bg-white p-4">
              <Stat label="Mean pass" value={`${stats.mean.toFixed(3)} ms`} testId="bench-mean" />
              <Stat label="p95 pass" value={`${stats.p95.toFixed(3)} ms`} testId="bench-p95" />
              <Stat label="Samples" value={String(stats.count)} testId="bench-count" />
            </div>

            <div className="grid grid-cols-3 gap-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
              <Stat label="Storm mean pass" value={`${stormStats.mean.toFixed(3)} ms`} />
              <Stat label="Storm p95 pass" value={`${stormStats.p95.toFixed(3)} ms`} />
              <Stat label="Storm samples" value={String(stormStats.count)} />
            </div>
          </>
        ) : (
          <p className="rounded-lg border border-gray-200 bg-white p-4 text-gray-500">
            Stats readout is off (nostats). Read window.benchStats for the rolling numbers.
          </p>
        )}

        {nestedScrollActive ? (
          <div className="h-64 overflow-auto rounded-lg border border-gray-200 bg-white p-4">
            <div ref={nestedScrollInnerRef} className="h-[150%] overflow-auto">
              <div
                className="grid gap-1 p-4"
                style={{ gridTemplateColumns: "repeat(auto-fill, minmax(1rem, 1fr))" }}
              >
                {anchorIds.map((id) => (
                  <BenchCell key={id} anchorId={id} />
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div
            ref={gridRef}
            className="grid gap-1 rounded-lg border border-gray-200 bg-white p-4"
            style={{ gridTemplateColumns: "repeat(auto-fill, minmax(1rem, 1fr))" }}
          >
            {anchorIds.map((id) => (
              <BenchCell key={id} anchorId={id} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, testId }: { label: string; value: string; testId?: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-xs uppercase tracking-wide text-gray-400">{label}</span>
      <span className="text-xl font-semibold tabular-nums" data-testid={testId}>
        {value}
      </span>
    </div>
  );
}
