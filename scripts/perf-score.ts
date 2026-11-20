// Measured performance score: bundle size, wire size, core hot paths, steady-state allocation and, with --relay, relay latency.
// Usage: bun run perf:score [--relay]. Run `bun run build` first. Prints a table and writes .crew/rounds/perf-score.json when .crew exists.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { gzipSync } from "node:zlib";
import { Bench } from "tinybench";
import { registerHotPathCases } from "../packages/core/bench/hotpath.bench";
import { binaryCodec } from "../packages/core/src/binary-codec";
import { jsonCodec } from "../packages/core/src/codec";
import type { PresenceMessage } from "../packages/core/src/protocol";
import { RemotePresenceStore } from "../packages/core/src/store";

const rootDir = dirname(import.meta.dirname);

// Bands: a metric scores 10 up to `ten`, 9 up to `nine`, 7 up to `seven`, else 5. `higher` flips the comparison.
type Budget = { ten: number; nine: number; seven: number; higher?: boolean };

const BUDGETS: Record<string, Budget> = {
  // Whole entry, so binaryCodec and the in-memory transports count; apps tree-shake what they do not import.
  "bundle core gzip (KB)": { ten: 7, nine: 10, seven: 13 },
  "bundle core app (jsonCodec client only, KB)": { ten: 7, nine: 9, seven: 13 },
  "bundle dom gzip (KB)": { ten: 10, nine: 13, seven: 19 },
  "bundle react gzip (KB)": { ten: 4, nine: 5, seven: 8 },
  "wire json steady cursor (bytes)": { ten: 220, nine: 300, seven: 420 },
  "wire binary steady cursor (bytes)": { ten: 80, nine: 110, seven: 160 },
  "inbound binary path (us)": { ten: 3, nine: 6, seven: 12 },
  "inbound json path (us)": { ten: 4, nine: 8, seven: 16 },
  "store.ingest, 200 clients (us per message)": { ten: 0.5, nine: 1, seven: 3 },
  "heap per ingested message (bytes)": { ten: 64, nine: 256, seven: 1024 },
  "relay p99 latency at 50 clients (ms)": { ten: 15, nine: 50, seven: 120 },
  "relay delivery ratio at 50 clients (%)": { ten: 99.5, nine: 98, seven: 95, higher: true },
};

function scoreOf(name: string, value: number): number {
  const budget = BUDGETS[name];
  if (budget === undefined || Number.isNaN(value)) return 5;
  const within = (limit: number) => (budget.higher === true ? value >= limit : value <= limit);
  if (within(budget.ten)) return 10;
  if (within(budget.nine)) return 9;
  if (within(budget.seven)) return 7;
  return 5;
}

const metrics = new Map<string, number>();

async function bundleSizes(): Promise<void> {
  for (const name of ["core", "dom", "react"] as const) {
    const result = await Bun.build({
      entrypoints: [join(rootDir, `packages/${name}/dist/index.js`)],
      minify: true,
      target: "browser",
      external: ["@dammers/anchor-presence-*", "react", "react-dom", "react/jsx-runtime"],
    });
    const output = result.outputs[0];
    if (result.success !== true || output === undefined)
      throw new Error(`bundle failed for ${name}: run bun run build`);
    metrics.set(`bundle ${name} gzip (KB)`, gzipSync(Buffer.from(await output.text())).length / 1024);
  }
  metrics.set("bundle core app (jsonCodec client only, KB)", await coreAppBundleKb());
}

// An app imports only what it uses, so the bundler drops binaryCodec and the in-memory transports.
async function coreAppBundleKb(): Promise<number> {
  const dir = mkdtempSync(join(rootDir, "node_modules", ".anchor-app-"));
  try {
    const entry = join(dir, "entry.js");
    const core = join(rootDir, "packages/core/dist/index.js").replaceAll("\\", "/");
    writeFileSync(
      entry,
      `import { createPresenceClient, jsonCodec } from "${core}";
globalThis.app = [createPresenceClient, jsonCodec];
`,
    );
    const result = await Bun.build({ entrypoints: [entry], minify: true, target: "browser" });
    const output = result.outputs[0];
    if (result.success !== true || output === undefined) throw new Error("app bundle failed");
    return gzipSync(Buffer.from(await output.text())).length / 1024;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const steady: PresenceMessage = {
  version: 1,
  clientId: "Qm3xT9vLk2Zp",
  session: "H7sWc1eYb0Nd",
  sequence: 4242,
  cursor: {
    anchors: [
      { id: "orders.table", u: 0.4132, v: 0.2871 },
      { id: "dashboard.main", u: 0.2201, v: 0.6034 },
      { id: "app.shell", u: 0.1103, v: 0.4412 },
    ],
  },
  pointer: { type: "mouse" },
};

function wireSizes(): void {
  metrics.set("wire json steady cursor (bytes)", jsonCodec.encode(steady).byteLength);
  metrics.set("wire binary steady cursor (bytes)", binaryCodec.encode(steady).byteLength);
}

function heapPerMessage(): void {
  const clients = 200;
  const rounds = 500;
  const store = new RemotePresenceStore({ maxRemoteClients: clients });
  const messages: PresenceMessage[] = [];
  for (let id = 0; id < clients; id += 1) {
    messages.push({ ...steady, clientId: `client-${id}`, sequence: 0 });
  }
  for (const message of messages) store.ingest(message);
  const gc = (globalThis as { Bun?: { gc: (force: boolean) => void } }).Bun?.gc;
  gc?.(true);
  const before = process.memoryUsage().heapUsed;
  for (let round = 1; round <= rounds; round += 1) {
    for (const message of messages) {
      store.ingest({ ...message, sequence: round, cursor: { anchors: message.cursor?.anchors ?? [] } });
    }
  }
  gc?.(true);
  const delta = process.memoryUsage().heapUsed - before;
  metrics.set("heap per ingested message (bytes)", Math.max(0, delta) / (clients * rounds));
}

async function hotPaths(): Promise<void> {
  const bench = new Bench({ time: 300 });
  registerHotPathCases(bench);
  await bench.run();
  for (const task of bench.tasks) {
    const meanMs = task.result?.state === "completed" ? task.result.latency.mean : Number.NaN;
    if (task.name.startsWith("binaryCodec full inbound path"))
      metrics.set("inbound binary path (us)", meanMs * 1000);
    else if (task.name.startsWith("full inbound path")) metrics.set("inbound json path (us)", meanMs * 1000);
    else if (task.name.startsWith("store.ingest steady-state: 200 clients")) {
      metrics.set("store.ingest, 200 clients (us per message)", (meanMs * 1000) / 200);
    }
  }
}

function median(values: number[]): number {
  return values.toSorted((a, b) => a - b)[Math.floor(values.length / 2)] ?? Number.NaN;
}

function relayLoad(): void {
  // the load generator shares this machine with the relay, so one run is noisy: take the median of three
  const p99: number[] = [];
  const ratios: number[] = [];
  for (let run = 0; run < 3; run += 1) {
    const result = spawnSync("bun", ["run", "scripts/relay-load.ts", "--clients", "50", "--seconds", "5"], {
      cwd: rootDir,
      encoding: "utf8",
      timeout: 120_000,
    });
    const line = /N=50:.*?ratio=([\d.]+)%.*?p99=(\d+)ms/u.exec(result.stdout);
    if (line === null) continue;
    ratios.push(Number(line[1]));
    p99.push(Number(line[2]));
  }
  if (p99.length === 0) return;
  metrics.set("relay delivery ratio at 50 clients (%)", median(ratios));
  metrics.set("relay p99 latency at 50 clients (ms)", median(p99));
}

await bundleSizes();
wireSizes();
heapPerMessage();
await hotPaths();
if (process.argv.includes("--relay")) relayLoad();

const rows = Object.keys(BUDGETS).map((name) => {
  const value = metrics.get(name);
  return {
    metric: name,
    value: value === undefined ? "(not run)" : value.toFixed(2),
    score: value === undefined ? "-" : scoreOf(name, value),
  };
});
console.table(rows);

const scores = [...metrics].map(([name, value]) => scoreOf(name, value));
const lowest = scores.length === 0 ? 0 : Math.min(...scores);
const mean = scores.length === 0 ? 0 : scores.reduce((sum, score) => sum + score, 0) / scores.length;
console.log(
  `performance score: lowest metric ${lowest}, mean ${mean.toFixed(2)} over ${scores.length} metrics`,
);

const outDir = join(rootDir, ".crew/rounds");
if (existsSync(join(rootDir, ".crew"))) {
  mkdirSync(outDir, { recursive: true });
  writeFileSync(
    join(outDir, "perf-score.json"),
    `${JSON.stringify({ metrics: Object.fromEntries(metrics), lowest, mean }, null, 2)}\n`,
  );
}
