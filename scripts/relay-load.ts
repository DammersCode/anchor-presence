// Local-only relay load test (plan 027). Starts apps/server, opens N native WebSocket clients in one
// room sending real binaryCodec cursor messages at 20 Hz, and reports throughput, delivery ratio,
// latency percentiles, and relay process CPU/RSS. Never runs in CI.
//
// Usage: bun run scripts/relay-load.ts --clients 50,100,200 --seconds 10

import { spawn, type ChildProcess } from "node:child_process";
import net from "node:net";
import path from "node:path";
import { binaryCodec } from "../packages/core/src/binary-codec";
import { validatePresence } from "../packages/core/src/validate";
import type { CursorPresence } from "../packages/core/src/protocol";

const repoRoot = path.resolve(import.meta.dirname, "..");
const PUBLISH_HZ = 20;
const PUBLISH_INTERVAL_MS = 1000 / PUBLISH_HZ;
const ROOM = "relay-load";

function parseArgs(argv: string[]): { clientCounts: number[]; seconds: number } {
  let clientCounts = [50, 100, 200];
  let seconds = 10;
  for (let i = 0; i < argv.length; i++) {
    const next = argv[i + 1];
    if (argv[i] === "--clients" && next !== undefined) {
      clientCounts = next.split(",").map((s) => Math.trunc(Number(s.trim())));
      i++;
    } else if (argv[i] === "--seconds" && next !== undefined) {
      seconds = Math.trunc(Number(next));
      i++;
    }
  }
  return { clientCounts, seconds };
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        server.close(() => reject(new Error("expected a numeric port")));
        return;
      }
      server.close(() => resolve(address.port));
    });
    server.on("error", reject);
  });
}

function waitForPort(port: number, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const tryConnect = () => {
      const socket = net.connect(port, "127.0.0.1");
      socket.once("connect", () => {
        socket.end();
        resolve();
      });
      socket.once("error", () => {
        socket.destroy();
        if (Date.now() > deadline) reject(new Error(`port ${port} did not open`));
        else setTimeout(tryConnect, 100);
      });
    };
    tryConnect();
  });
}

type RelayEnv = {
  port: number;
  maxRoomSockets: number;
  maxTotalSockets: number;
  rateCapacity: number;
  rateRefillPerSecond: number;
};

/** Starts apps/server with room/socket/rate caps raised so the client count under test is not itself rejected. */
function startRelay(env: RelayEnv): ChildProcess {
  // spawns the file directly (not `bun run --cwd ... dev`) so relay.pid is the real worker process,
  // not a wrapper: `bun run <script>` re-execs a child, which would make CPU/RSS sampling read the wrong pid
  return spawn("bun", [path.join(repoRoot, "apps/server/index.ts")], {
    cwd: path.join(repoRoot, "apps/server"),
    env: {
      ...process.env,
      PORT: String(env.port),
      RELAY_MAX_ROOM_SOCKETS: String(env.maxRoomSockets),
      RELAY_MAX_TOTAL_SOCKETS: String(env.maxTotalSockets),
      RATE_CAPACITY: String(env.rateCapacity),
      RATE_REFILL_PER_SECOND: String(env.rateRefillPerSecond),
    },
    stdio: "ignore",
    windowsHide: true,
  });
}

async function sampleProcessWindows(pid: number): Promise<{ cpuMs: number; rssBytes: number } | null> {
  const proc = spawn(
    "powershell",
    [
      "-NoProfile",
      "-Command",
      `try { $p = Get-Process -Id ${pid}; "$($p.CPU)|$($p.WorkingSet64)" } catch { "" }`,
    ],
    { stdio: ["ignore", "pipe", "ignore"], windowsHide: true },
  );
  const chunks: Buffer[] = [];
  if (proc.stdout !== null) for await (const chunk of proc.stdout) chunks.push(chunk as Buffer);
  const out = Buffer.concat(chunks).toString("utf8");
  const [cpuSecondsStr, rssStr] = out.trim().split("|");
  if (cpuSecondsStr === undefined || cpuSecondsStr === "") return null;
  return { cpuMs: Number(cpuSecondsStr) * 1000, rssBytes: Math.trunc(Number(rssStr ?? "0")) };
}

async function sampleProcessPosix(pid: number): Promise<{ cpuMs: number; rssBytes: number } | null> {
  try {
    const { readFile } = await import("node:fs/promises");
    const stat = await readFile(`/proc/${pid}/stat`, "utf8");
    const fields = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
    const utime = Math.trunc(Number(fields[11]));
    const stime = Math.trunc(Number(fields[12]));
    const clockTicksPerSec = 100;
    const cpuMs = ((utime + stime) / clockTicksPerSec) * 1000;
    const status = await readFile(`/proc/${pid}/status`, "utf8");
    const rssMatch = /VmRSS:\s*(\d+)\s*kB/u.exec(status);
    const rssBytes = rssMatch ? Math.trunc(Number(rssMatch[1])) * 1024 : 0;
    return { cpuMs, rssBytes };
  } catch {
    return null;
  }
}

/** Samples a process's CPU time and RSS. Windows uses PowerShell Get-Process; POSIX reads /proc. */
function sampleProcess(pid: number): Promise<{ cpuMs: number; rssBytes: number } | null> {
  return process.platform === "win32" ? sampleProcessWindows(pid) : sampleProcessPosix(pid);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

type ProcessSample = { atMs: number; cpuMs: number; rssBytes: number };

function summarizeSamples(samples: ProcessSample[]): { peakRssBytes: number; avgCpuPercent: number } {
  const peakRssBytes = samples.reduce((max, s) => Math.max(max, s.rssBytes), 0);
  let avgCpuPercent = 0;
  const first = samples.at(0);
  const last = samples.at(-1);
  if (samples.length >= 2 && first !== undefined && last !== undefined) {
    const cpuDeltaMs = last.cpuMs - first.cpuMs;
    const wallDeltaMs = last.atMs - first.atMs;
    avgCpuPercent = wallDeltaMs > 0 ? (cpuDeltaMs / wallDeltaMs) * 100 : 0;
  }
  return { peakRssBytes, avgCpuPercent };
}

/** Polls sampleProcess at 1 Hz until stop() is called, reporting peak RSS and average CPU % over the window. */
function monitorRelay(pid: number): { stop: () => Promise<{ peakRssBytes: number; avgCpuPercent: number }> } {
  const samples: ProcessSample[] = [];
  const startedAt = Date.now();
  const stoppedBox = { current: false };

  async function poll(): Promise<void> {
    for (;;) {
      if (stoppedBox.current) return;
      const sample = await sampleProcess(pid);
      if (sample !== null) samples.push({ atMs: Date.now() - startedAt, ...sample });
      if (stoppedBox.current) return;
      await sleep(1000);
    }
  }
  const loopPromise = poll();

  return {
    async stop() {
      stoppedBox.current = true;
      await loopPromise;
      return summarizeSamples(samples);
    },
  };
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1);
  return sorted.at(Math.max(0, index)) ?? 0;
}

function makeClientId(i: number): string {
  return `load-${i}`;
}

type RunResult = {
  clients: number;
  sentPerSec: number;
  deliveredPerSec: number;
  /** Design target: N x (N-1) x 20 Hz, assuming every client achieves the nominal publish rate. */
  targetDeliveredPerSec: number;
  /** sentPerSec x (N-1): what delivered/s should be if the relay dropped nothing sent. */
  expectedDeliveredPerSec: number;
  deliveryRatio: number;
  latencyP50: number;
  latencyP99: number;
  latencyP99_9: number;
  dropped: number;
  /** WebSocket close codes seen during the run, e.g. { 1000: 200 } for a clean close, or { 4003: 12 } for slow-peer. */
  closeCodes: Record<number, number>;
  avgCpuPercent: number;
  peakRssBytes: number;
};

async function runForClientCount(clientCount: number, seconds: number): Promise<RunResult> {
  const port = await freePort();
  // room/socket caps default to 128/10000; the socket cap is raised only when clientCount needs it,
  // and the rate cap stays at the shipped default (40 burst / 20 per second) unless explicitly raised
  const relay = startRelay({
    port,
    maxRoomSockets: Math.max(128, clientCount + 8),
    maxTotalSockets: Math.max(10_000, clientCount + 8),
    rateCapacity: 40,
    rateRefillPerSecond: 20,
  });
  if (relay.pid === undefined) throw new Error("relay did not start (no pid)");
  await waitForPort(port, 15_000);

  const sockets: WebSocket[] = [];
  const sentAt = new Map<string, number>();
  const latenciesMs: number[] = [];
  let steadySentCount = 0;
  let steadyDeliveredCount = 0;
  const closeCodeCounts = new Map<number, number>();
  const WARMUP_MS = 1000;
  const runStartedAt = { current: 0 };

  await Promise.all(
    Array.from({ length: clientCount }, (_, i) => {
      return new Promise<void>((resolve, reject) => {
        const ws = new WebSocket(`ws://127.0.0.1:${port}/?room=${ROOM}`);
        ws.binaryType = "arraybuffer";
        const clientId = makeClientId(i);
        const timer = setTimeout(() => reject(new Error(`client ${clientId} open timeout`)), 5000);

        ws.addEventListener("open", () => {
          clearTimeout(timer);
          resolve();
        });
        ws.addEventListener("error", () => {
          clearTimeout(timer);
          reject(new Error(`client ${clientId} failed to open`));
        });
        ws.addEventListener("close", (event) => {
          closeCodeCounts.set(event.code, (closeCodeCounts.get(event.code) ?? 0) + 1);
        });
        ws.addEventListener("message", (event) => {
          if (!(event.data instanceof ArrayBuffer)) return;
          const decoded = binaryCodec.decode(new Uint8Array(event.data));
          const presence = validatePresence(decoded);
          if (presence === null) return;
          const key = `${presence.clientId}:${presence.sequence}`;
          const sentAtMs = sentAt.get(key);
          if (sentAtMs === undefined) return;
          const elapsedSinceStart = sentAtMs - runStartedAt.current;
          const isSteadyState =
            elapsedSinceStart > WARMUP_MS && elapsedSinceStart < seconds * 1000 - WARMUP_MS;
          if (isSteadyState) {
            steadyDeliveredCount += 1;
            latenciesMs.push(Date.now() - sentAtMs);
          }
        });
        sockets.push(ws);
      });
    }),
  );

  const monitor = monitorRelay(relay.pid);

  runStartedAt.current = Date.now();
  let sequence = 0;
  const publishTimer = setInterval(() => {
    sequence += 1;
    const sentAtMs = Date.now();
    const elapsedSinceStart = sentAtMs - runStartedAt.current;
    const isSteadyState = elapsedSinceStart > WARMUP_MS && elapsedSinceStart < seconds * 1000 - WARMUP_MS;
    for (let i = 0; i < sockets.length; i++) {
      const ws = sockets[i];
      if (ws === undefined || ws.readyState !== WebSocket.OPEN) continue;
      const clientId = makeClientId(i);
      const message: CursorPresence = {
        version: 1,
        clientId,
        session: `${clientId}-s`,
        sequence,
        cursor: { anchors: [{ id: "a1", u: Math.random(), v: Math.random() }] },
        user: { name: clientId, color: "#6366f1" },
      };
      sentAt.set(`${clientId}:${sequence}`, sentAtMs);
      // @types/node's Uint8Array<ArrayBufferLike> vs DOM lib's ArrayBufferView<ArrayBuffer>: same bytes, wider type
      ws.send(binaryCodec.encode(message) as Uint8Array<ArrayBuffer>);
      if (isSteadyState) steadySentCount += 1;
    }
  }, PUBLISH_INTERVAL_MS);

  await sleep(seconds * 1000);
  clearInterval(publishTimer);
  await sleep(500); // drain in-flight deliveries

  const { peakRssBytes, avgCpuPercent } = await monitor.stop();

  // snapshot close codes before our own teardown close() below adds normal-closure codes
  const closeCodes = Object.fromEntries(closeCodeCounts);

  for (const ws of sockets) ws.close();
  relay.kill();
  await sleep(200);

  const sorted = latenciesMs.toSorted((a, b) => a - b);
  const steadySeconds = Math.max(1, seconds - 2 * (WARMUP_MS / 1000));
  const sentPerSec = steadySentCount / steadySeconds;
  const deliveredPerSec = steadyDeliveredCount / steadySeconds;
  // per-client send rate is measured, not assumed 20 Hz: setInterval(fn, 50) can run under nominal
  // rate under load, so the delivery ratio that matters compares delivered against what was actually sent
  const targetDeliveredPerSec = clientCount * (clientCount - 1) * PUBLISH_HZ;
  const expectedDeliveredPerSec = sentPerSec * (clientCount - 1);

  return {
    clients: clientCount,
    sentPerSec,
    deliveredPerSec,
    targetDeliveredPerSec,
    expectedDeliveredPerSec,
    deliveryRatio: expectedDeliveredPerSec > 0 ? deliveredPerSec / expectedDeliveredPerSec : 0,
    latencyP50: percentile(sorted, 0.5),
    latencyP99: percentile(sorted, 0.99),
    latencyP99_9: percentile(sorted, 0.999),
    dropped: Math.max(0, expectedDeliveredPerSec * steadySeconds - steadyDeliveredCount),
    closeCodes,
    avgCpuPercent,
    peakRssBytes,
  };
}

async function main(): Promise<void> {
  const { clientCounts, seconds } = parseArgs(process.argv.slice(2));

  console.log(`relay-load: clients=${clientCounts.join(",")} seconds=${seconds} room=${ROOM}`);
  console.log(
    "note: room/socket caps raised to fit the client count under test (RELAY_MAX_ROOM_SOCKETS," +
      " RELAY_MAX_TOTAL_SOCKETS); the rate limit stays at the shipped default (40 burst, 20/s refill)." +
      " closeCodes below shows whether a drop came from a forced disconnect (slow-peer 4003, room/server" +
      " full) or from the relay's event loop simply falling behind while every socket stayed open.",
  );
  console.log(
    "note: 'sent/s' is the measured per-client publish rate, not assumed 20 Hz — this machine's" +
      " setInterval(fn, 50) timer runs under nominal rate under load (Bun/Windows timer granularity)," +
      " so 'expected/s' (sent/s x (N-1)) is the fair delivery target, and 'target/s' (design N x (N-1) x 20)" +
      " is shown only for reference against the spec's nominal publish rate.",
  );

  const results: RunResult[] = [];
  for (const clientCount of clientCounts) {
    console.log(`\nrunning N=${clientCount} for ${seconds}s...`);
    const result = await runForClientCount(clientCount, seconds);
    results.push(result);
    console.log(
      `N=${clientCount}: sent/s=${result.sentPerSec.toFixed(0)} delivered/s=${result.deliveredPerSec.toFixed(0)}` +
        ` ratio=${(result.deliveryRatio * 100).toFixed(1)}% p50=${result.latencyP50}ms p99=${result.latencyP99}ms` +
        ` cpu=${result.avgCpuPercent.toFixed(1)}% rss=${(result.peakRssBytes / 1024 / 1024).toFixed(1)}MB` +
        ` closeCodes=${JSON.stringify(result.closeCodes)}`,
    );
  }

  console.log("\nfinal report:");
  console.table(
    results.map((r) => ({
      clients: r.clients,
      "sent/s": r.sentPerSec.toFixed(0),
      "delivered/s": r.deliveredPerSec.toFixed(0),
      "expected/s": r.expectedDeliveredPerSec.toFixed(0),
      "target/s": r.targetDeliveredPerSec,
      "ratio %": (r.deliveryRatio * 100).toFixed(1),
      "p50 ms": r.latencyP50,
      "p99 ms": r.latencyP99,
      "p99.9 ms": r.latencyP99_9,
      dropped: Math.round(r.dropped),
      "cpu %": r.avgCpuPercent.toFixed(1),
      "rss MB": (r.peakRssBytes / 1024 / 1024).toFixed(1),
    })),
  );
}

await main();
