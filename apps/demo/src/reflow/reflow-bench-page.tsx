// K3 reflow bench: one sender, ~100 scrollable content rows, 4 nested anchors.
// Drives pointermove at frame rate while the page is idle / scrolling / layout-dirty,
// and reports frame times, getBoundingClientRect call stats and longtask counters.
// Controlled by e2e/reflow-perf.spec.ts via window.__reflowBench.runScenario(name, ms).
import { useEffect, useRef, useState } from "react";
import { createPresenceClient, jsonCodec, noneInterpolator } from "@dammers/anchor-presence-core";
import type { PresenceClient } from "@dammers/anchor-presence-core";
import { CURSOR_MARKER_ATTRIBUTE, createDomBinding } from "@dammers/anchor-presence-dom";
import type { DomBinding } from "@dammers/anchor-presence-dom";
import { createLoopbackTransport } from "../bench/loopback-transport";
import type { LoopbackTransport } from "../bench/loopback-transport";

export type ScenarioName = "idle" | "scroll" | "layout";

export type StatSample = { mean: number; p95: number; max: number; count: number };

export type ReflowReport = {
  scenario: ScenarioName;
  ms: number;
  pointerSamples: number;
  sends: number;
  frames: StatSample;
  gbcR: {
    counts: { pointer: number; raf: number; other: number };
    pointerMs: StatSample;
    rafMs: StatSample;
    otherMs: StatSample;
    /** pointer-tagged rect reads taking >= EXPENSIVE_READ_MS (proxy for a forced layout) */
    expensivePointer: number;
  };
  longTasks: { count: number; sum: number; max: number };
};

const EXPENSIVE_READ_MS = 0.5;

export type ReflowSpyState = {
  frames: number[];
  pointerMs: number[];
  rafMs: number[];
  otherMs: number[];
  pointer: number;
  raf: number;
  other: number;
  longTasks: { count: number; sum: number; max: number };
};

declare global {
  interface Window {
    __reflowSpy?: ReflowSpyState;
    __inPointerDispatch?: boolean;
    __inRaf?: boolean;
    __reflowBench?: { runScenario: (scenario: ScenarioName, ms: number) => Promise<ReflowReport> };
  }
}

// ?rows=N (clamped 20..2000) so the bench can be re-run at a heavier page size
const ROW_COUNT = Math.min(
  2000,
  Math.max(20, Number(new URLSearchParams(window.location.search).get("rows") ?? 100) || 100),
);
const ROWS = Array.from({ length: ROW_COUNT }, (_, i) => i);

const ANCHOR_IDS = ["reflow.1", "reflow.2", "reflow.3", "reflow.4"] as const;
// outermost first; each level is a clipping ancestor of the innermost, so the
// scheduler's frame cache measures all four anchors on every pass
const ANCHOR_SIZES = [
  { width: 360, height: 260 },
  { width: 328, height: 228 },
  { width: 296, height: 196 },
  { width: 264, height: 164 },
] as const;

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1);
  return sorted[Math.max(0, index)]!;
}

function statsOf(values: number[]): StatSample {
  if (values.length === 0) return { mean: 0, p95: 0, max: 0, count: 0 };
  let sum = 0;
  let max = 0;
  for (const v of values) {
    sum += v;
    if (v > max) max = v;
  }
  return { mean: sum / values.length, p95: percentile(values, 0.95), max, count: values.length };
}

function startLoop(callback: (timestampMs: number) => void): () => void {
  let handle = 0;
  let stopped = false;
  function tick(timestampMs: number) {
    if (stopped) return;
    handle = requestAnimationFrame(tick);
    callback(timestampMs);
  }
  handle = requestAnimationFrame(tick);
  return () => {
    stopped = true;
    cancelAnimationFrame(handle);
  };
}

// Task-phase loop: fires between frames (after the previous frame's layout step), the same
// phase real pointermove input events and async layout writes land in
function startTimerLoop(delayMs: number, callback: () => void): () => void {
  let handle: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  function tick() {
    if (stopped) return;
    handle = setTimeout(tick, delayMs);
    callback();
  }
  handle = setTimeout(tick, delayMs);
  return () => {
    stopped = true;
    clearTimeout(handle);
  };
}

export function ReflowBenchPage() {
  const scrollBoxRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const targetRef = useRef<HTMLDivElement | null>(null);
  const cursorRef = useRef<HTMLDivElement | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const win = window;
    if (win.__reflowSpy === undefined) {
      win.__reflowSpy = {
        frames: [],
        pointerMs: [],
        rafMs: [],
        otherMs: [],
        pointer: 0,
        raf: 0,
        other: 0,
        longTasks: { count: 0, sum: 0, max: 0 },
      };
    }

    const base = createLoopbackTransport();
    const sendCounts = { count: 0 };
    const transport: LoopbackTransport = {
      ...base,
      send: () => {
        sendCounts.count += 1;
      },
    };

    const client: PresenceClient<unknown, unknown> = createPresenceClient({
      transport,
      codec: jsonCodec,
    });
    const binding: DomBinding<unknown, unknown> = createDomBinding(client, {
      resolution: { interpolatorFactory: noneInterpolator },
    });

    const unsubscribe = binding.subscribe(() => {
      const el = cursorRef.current;
      if (el === null) return;
      const cursor = binding.getSnapshot()[0];
      if (cursor === undefined || !cursor.visible) {
        el.style.transform = "translate3d(-100px, -100px, 0)";
        return;
      }
      el.style.transform = `translate3d(${cursor.x + 6}px, ${cursor.y + 6}px, 0)`;
    });

    // one static remote cursor: keeps hasActiveCursors() true so the scheduler stays attached.
    // innermost-first chain mirrors a real sender; the resolver wins reflow.4, whose
    // clipping ancestors are the other three anchors
    const remote = {
      version: 1 as const,
      clientId: "reflow-remote",
      session: "reflow-remote-s1",
      sequence: 0,
      cursor: {
        anchors: ANCHOR_IDS.map((id) => ({ id, u: 0.5, v: 0.5 })).reverse(),
      },
      user: { name: "reflow-remote", color: "#6366f1" },
    };
    transport.injectInbound(jsonCodec.encode(remote));

    let activeStop: Array<() => void> = [];
    function stopDrivers(): void {
      for (const stop of activeStop) stop();
      activeStop = [];
    }

    function runScenario(name: ScenarioName, ms: number): Promise<ReflowReport> {
      return new Promise((resolve) => {
        stopDrivers();
        const spy = win.__reflowSpy!;
        spy.frames.length = 0;
        spy.pointerMs.length = 0;
        spy.rafMs.length = 0;
        spy.otherMs.length = 0;
        spy.pointer = 0;
        spy.raf = 0;
        spy.other = 0;
        spy.longTasks.count = 0;
        spy.longTasks.sum = 0;
        spy.longTasks.max = 0;

        const target = targetRef.current;
        const scroller = scrollBoxRef.current;
        const content = contentRef.current;
        if (target === null || scroller === null || content === null) {
          stopDrivers();
          resolve({
            scenario: name,
            ms,
            pointerSamples: 0,
            sends: 0,
            frames: statsOf([]),
            gbcR: {
              counts: { pointer: 0, raf: 0, other: 0 },
              pointerMs: statsOf([]),
              rafMs: statsOf([]),
              otherMs: statsOf([]),
              expensivePointer: 0,
            },
            longTasks: { count: 0, sum: 0, max: 0 },
          });
          return;
        }

        const baseSends = sendCounts.count;
        let pointerSamples = 0;

        let lastTs = 0;
        activeStop.push(
          startLoop((ts) => {
            if (lastTs > 0) spy.frames.push(ts - lastTs);
            lastTs = ts;
          }),
        );

        // task-phase dispatch (timer, not rAF): real pointermove input events are processed
        // in the frame's input phase, before rAF callbacks and the frame's layout step —
        // the interleaving where a dirty frame meets a live getBoundingClientRect
        const seed = target.getBoundingClientRect();
        let px = seed.left + seed.width / 2;
        let py = seed.top + seed.height / 2;
        activeStop.push(
          startTimerLoop(16, () => {
            win.__inPointerDispatch = true;
            try {
              target.dispatchEvent(
                new PointerEvent("pointermove", {
                  clientX: px + (Math.random() - 0.5) * 20,
                  clientY: py + (Math.random() - 0.5) * 20,
                  pointerType: "mouse",
                  bubbles: true,
                }),
              );
            } finally {
              win.__inPointerDispatch = false;
            }
            pointerSamples += 1;
          }),
        );

        if (name === "scroll" || name === "layout") {
          let dir = 1;
          activeStop.push(
            startLoop(() => {
              const max = scroller.scrollHeight - scroller.clientHeight;
              let next = scroller.scrollTop + dir * 40;
              if (next >= max) {
                next = max;
                dir = -1;
              } else if (next <= 0) {
                next = 0;
                dir = 1;
              }
              scroller.scrollTop = next;
            }),
          );
        }

        if (name === "layout") {
          // task-phase layout write (a 2x-faster timer than the pointer): style writes from
          // async work (timers, data updates) leave layout pending at the next input phase,
          // which is what makes a live getBoundingClientRect force a synchronous reflow
          activeStop.push(
            startTimerLoop(8, () => {
              const phase = (Math.sin(performance.now() / 500) + 1) / 2;
              content.style.width = `${60 + phase * 40}%`;
            }),
          );
        }

        const startedAt = performance.now();
        activeStop.push(
          startLoop(() => {
            if (performance.now() - startedAt < ms) return;
            stopDrivers();
            let expensivePointer = 0;
            for (const v of spy.pointerMs) if (v >= EXPENSIVE_READ_MS) expensivePointer += 1;
            resolve({
              scenario: name,
              ms,
              pointerSamples,
              sends: sendCounts.count - baseSends,
              frames: statsOf(spy.frames),
              gbcR: {
                counts: { pointer: spy.pointer, raf: spy.raf, other: spy.other },
                pointerMs: statsOf(spy.pointerMs),
                rafMs: statsOf(spy.rafMs),
                otherMs: statsOf(spy.otherMs),
                expensivePointer,
              },
              longTasks: { ...spy.longTasks },
            });
          }),
        );
      });
    }

    win.__reflowBench = { runScenario };
    setReady(true);

    return () => {
      stopDrivers();
      unsubscribe();
      binding.dispose();
      client.dispose();
      win.__reflowBench = undefined;
    };
  }, []);

  function renderAnchor(level: number) {
    const size = ANCHOR_SIZES[level]!;
    const inner =
      level + 1 < ANCHOR_IDS.length ? (
        renderAnchor(level + 1)
      ) : (
        <span
          ref={targetRef}
          style={{
            display: "inline-block",
            padding: "8px 12px",
            background: "#eef2ff",
            borderRadius: 4,
            fontSize: 13,
          }}
        >
          pointer target
        </span>
      );
    return (
      <div
        key={ANCHOR_IDS[level]}
        data-anchor={ANCHOR_IDS[level]}
        style={{
          width: size.width,
          height: size.height,
          margin: "0 auto",
          padding: 16,
          boxSizing: "border-box",
          overflow: "hidden",
          background: `rgba(99, 102, 241, ${0.04 + level * 0.03})`,
          border: "1px solid #c7d2fe",
        }}
      >
        {inner}
      </div>
    );
  }

  return (
    <div style={{ height: "100vh", overflow: "hidden", background: "#f9fafb", color: "#111827" }}>
      <div ref={scrollBoxRef} style={{ height: "100%", overflowY: "auto" }}>
        <div ref={contentRef} style={{ width: "100%", boxSizing: "border-box", padding: 24 }}>
          <h1 style={{ fontSize: 18, fontWeight: 600 }}>K3 reflow bench</h1>
          <p style={{ fontSize: 13, color: "#6b7280" }}>
            {ready ? "ready — driven by e2e/reflow-perf.spec.ts" : "warming up…"}
          </p>
          <div data-testid="reflow-ready" style={{ display: ready ? "block" : "none" }} />
          {ROWS.map((i) => (
            <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center" }}>
              <div style={{ width: 64, fontSize: 12, color: "#6b7280" }}>#{String(i).padStart(3, "0")}</div>
              <div style={{ flex: 1, minWidth: 220, fontSize: 13 }}>
                Row {i} — lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod.
              </div>
              <div style={{ width: 80, fontSize: 12, color: "#9ca3af" }}>cell-{i}</div>
            </div>
          ))}
          <div style={{ margin: "24px auto" }}>{renderAnchor(0)}</div>
          {ROWS.map((i) => (
            <div key={`b${i}`} style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center" }}>
              <div style={{ width: 64, fontSize: 12, color: "#6b7280" }}>#{String(i).padStart(3, "0")}</div>
              <div style={{ flex: 1, minWidth: 220, fontSize: 13 }}>
                Row {i} — ut enim ad minim veniam, quis nostrud exercitation ullamco laboris.
              </div>
              <div style={{ width: 80, fontSize: 12, color: "#9ca3af" }}>cell-{i}</div>
            </div>
          ))}
        </div>
      </div>
      <div
        ref={cursorRef}
        {...{ [CURSOR_MARKER_ATTRIBUTE]: "" }}
        style={{
          position: "fixed",
          left: 0,
          top: 0,
          width: 12,
          height: 12,
          borderRadius: "50%",
          background: "#6366f1",
          transform: "translate3d(-100px, -100px, 0)",
          pointerEvents: "none",
        }}
      />
    </div>
  );
}
