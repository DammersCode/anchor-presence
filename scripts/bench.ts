// Runs the core hot-path benchmarks and gates them against a committed baseline.
// `bun run bench` checks; `bun run bench --update-baseline` refreshes packages/core/bench/baseline.json.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { Bench } from "tinybench";
import { registerHotPathCases } from "../packages/core/bench/hotpath.bench";

// CI runners are noisy: only flag a regression this far past the recorded baseline.
const TOLERANCE = 3;

const rootDir = dirname(import.meta.dirname);
const baselinePath = join(rootDir, "packages/core/bench/baseline.json");
const updateBaseline = process.argv.includes("--update-baseline");

type Baseline = Record<string, number>;

function readBaseline(): Baseline {
  if (!existsSync(baselinePath)) return {};
  return JSON.parse(readFileSync(baselinePath, "utf8")) as Baseline;
}

async function main(): Promise<void> {
  const bench = new Bench({ time: 300 });
  registerHotPathCases(bench);
  await bench.run();

  const baseline = readBaseline();
  const nextBaseline: Baseline = {};
  const failures: string[] = [];
  const rows = bench.tasks.map((task) => {
    const result = task.result;
    if (result?.state === "errored") failures.push(`${task.name}: ${result.error.message}`);
    const meanMs = result?.state === "completed" ? result.latency.mean : Number.NaN;
    nextBaseline[task.name] = meanMs;

    const baselineMs = baseline[task.name];
    const limitMs = baselineMs === undefined ? undefined : baselineMs * TOLERANCE;
    const regressed = limitMs !== undefined && meanMs > limitMs;
    if (regressed) failures.push(`${task.name}: ${meanMs.toFixed(4)}ms > ${limitMs.toFixed(4)}ms limit`);

    return {
      task: task.name,
      "mean (ms)": Number.isNaN(meanMs) ? "(errored)" : meanMs.toFixed(4),
      "baseline (ms)": baselineMs === undefined ? "(none)" : baselineMs.toFixed(4),
      "limit (ms)": limitMs === undefined ? "(none)" : limitMs.toFixed(4),
      status: result?.state === "errored" ? "ERROR" : regressed ? "REGRESSED" : "ok",
    };
  });

  console.table(rows);

  if (updateBaseline) {
    writeFileSync(baselinePath, `${JSON.stringify(nextBaseline, null, 2)}\n`);
    console.log(`Wrote baseline to ${baselinePath}`);
    return;
  }

  if (failures.length > 0) {
    console.error(`Benchmark gate failed:\n${failures.join("\n")}`);
    process.exit(1);
  }
}

await main();
