// K3 measurement: is the sender's pointermove reflow cost real and significant while the
// scheduler is dirty? Drives apps/demo/src/reflow/ReflowBenchPage (one sender, ~100 content
// rows, 4 nested anchors) through idle / scroll / layout-dirty scenarios at frame rate and
// records frame times, getBoundingClientRect call stats and longtask counters.
//
// Numbers are printed to the test log ([reflow-bench] lines) for .agent/benchmarks/perf-k3.md;
// the assertions here are machine-independent (sanity + the post-fix no-live-gBCR invariant).
import { test, expect } from "@playwright/test";

test.skip(
  ({ browserName }) => browserName !== "chromium",
  "chromium-only: reflow bench, not cross-browser coverage",
);

const WARMUP_MS = 1500;
const SCENARIO_MS = 2500;
// page size (content rows); bump via env to measure reflow cost at a heavier DOM
const ROWS = Number(process.env.REFLOW_ROWS ?? 100);
const SCENARIOS = ["idle", "scroll", "layout"] as const;
type ScenarioName = (typeof SCENARIOS)[number];

type StatSample = { mean: number; p95: number; max: number; count: number };

type ReflowReport = {
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
    expensivePointer: number;
  };
  longTasks: { count: number; sum: number; max: number };
};

type SpyWindow = {
  __reflowSpy?: {
    frames: number[];
    pointerMs: number[];
    rafMs: number[];
    otherMs: number[];
    pointer: number;
    raf: number;
    other: number;
    longTasks: { count: number; sum: number; max: number };
  };
  __inPointerDispatch: boolean;
  __inRaf: boolean;
  __reflowBench?: { runScenario: (scenario: ScenarioName, ms: number) => Promise<ReflowReport> };
};

/** Wraps rAF and Element.prototype.getBoundingClientRect to tag and time every rect read. */
function installSpy(): void {
  const w = window as unknown as SpyWindow & Window;
  if (w.__reflowSpy !== undefined) return;

  w.__reflowSpy = {
    frames: [],
    pointerMs: [],
    rafMs: [],
    otherMs: [],
    pointer: 0,
    raf: 0,
    other: 0,
    longTasks: { count: 0, sum: 0, max: 0 },
  };
  w.__inPointerDispatch = false;
  w.__inRaf = false;

  const origRaf = w.requestAnimationFrame.bind(w);
  w.requestAnimationFrame = (callback: FrameRequestCallback) =>
    origRaf((timestampMs) => {
      w.__inRaf = true;
      try {
        callback(timestampMs);
      } finally {
        w.__inRaf = false;
      }
    });

  const origGBCR = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function spiedGetBoundingClientRect(this: Element) {
    const spy = w.__reflowSpy!;
    const started = performance.now();
    const rect = origGBCR.call(this);
    const elapsedMs = performance.now() - started;
    if (w.__inPointerDispatch) {
      spy.pointer += 1;
      spy.pointerMs.push(elapsedMs);
    } else if (w.__inRaf) {
      spy.raf += 1;
      spy.rafMs.push(elapsedMs);
    } else {
      spy.other += 1;
      spy.otherMs.push(elapsedMs);
    }
    return rect;
  };

  try {
    const observer = new PerformanceObserver((list) => {
      const lt = w.__reflowSpy?.longTasks;
      if (lt === undefined) return;
      for (const entry of list.getEntries()) {
        lt.count += 1;
        lt.sum += entry.duration;
        if (entry.duration > lt.max) lt.max = entry.duration;
      }
    });
    observer.observe({ type: "longtask", buffered: true });
  } catch {
    // longtask entries are optional; frame and gBCR stats still carry the measurement
  }
}

function benchHandle(page: import("@playwright/test").Page) {
  return page.evaluateHandle(() => (window as unknown as SpyWindow).__reflowBench);
}

test.describe("sender pointermove reflow cost (K3)", () => {
  test("idle vs scroll vs layout @slow", async ({ page }) => {
    await page.addInitScript(installSpy);
    await page.goto(`/?page=reflow-bench&rows=${ROWS}`);
    await page.getByText("ready — driven by e2e/reflow-perf.spec.ts").waitFor({ timeout: 20_000 });

    await page.evaluate((ms: number) => {
      const w = window as unknown as SpyWindow;
      return w.__reflowBench!.runScenario("idle", ms);
    }, WARMUP_MS);

    const reports = new Map<ScenarioName, ReflowReport>();
    for (const scenario of SCENARIOS) {
      const handle = await benchHandle(page);
      const report = (await handle.evaluate(
        (
          bench: { runScenario: (name: ScenarioName, ms: number) => Promise<ReflowReport> },
          args: { name: ScenarioName; ms: number },
        ) => bench.runScenario(args.name, args.ms),
        { name: scenario, ms: SCENARIO_MS },
      )) as ReflowReport;
      reports.set(scenario, report);
      console.log(`[reflow-bench] ${scenario}`, JSON.stringify(report));
    }

    for (const scenario of SCENARIOS) {
      const r = reports.get(scenario)!;
      // the pointer driver must actually be driving (guards against a stalled loop)
      expect(r.pointerSamples, `${scenario}: pointer samples`).toBeGreaterThan(30);
      expect(r.sends, `${scenario}: outbound sends`).toBeGreaterThan(0);
      expect(r.frames.count, `${scenario}: sampled frames`).toBeGreaterThan(0);
      if (scenario !== "idle") {
        // a dirty scheduler re-measures every frame, so scheduler-side rect reads must occur
        expect(r.gbcR.counts.raf, `${scenario}: scheduler rect reads`).toBeGreaterThan(0);
      }
    }

    // K3 invariant: while the scheduler is dirty the pointer path reads the frame cache
    // instead of live getBoundingClientRect, so pointer-tagged rect reads stay near zero
    // even though every pointermove still resolves a 4-anchor fallback chain
    for (const scenario of ["scroll", "layout"] as const) {
      const r = reports.get(scenario)!;
      const liveRatio = r.gbcR.counts.pointer / r.pointerSamples;
      console.log(`[reflow-bench] ${scenario} live-gbcr-per-sample=${liveRatio.toFixed(3)}`);
      expect(liveRatio, `${scenario}: live gBCR per pointer sample`).toBeLessThan(0.05);
    }
  });
});
