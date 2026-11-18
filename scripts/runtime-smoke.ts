import { createPresenceClient } from "../packages/core/dist/index.js";
import { createWebSocketTransport } from "../packages/dom/dist/index.js";
import { createBunRelay } from "../examples/bun-native/server";
import { createNodeWsRelay } from "../examples/node-ws/server";

const runtime = typeof Bun === "undefined" ? "node" : `bun ${Bun.version}`;
let phase = "start";

function enter(next: string): void {
  phase = next;
  console.log(`phase: ${phase}`);
}

// not unref'd: a stalled await must end in this exit, never in a silent exit 0
setTimeout(() => {
  console.error(`runtime smoke test timed out in phase: ${phase} (${runtime})`);
  process.exit(1);
}, 30_000);

async function waitFor(condition: () => boolean, label: string): Promise<void> {
  const deadline = Date.now() + 5000;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error(`timed out: ${label}`);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

async function check(name: string, relay: { url: string; close: () => Promise<void> }): Promise<void> {
  const url = `${relay.url.replace("http", "ws").replace("localhost", "127.0.0.1")}/?room=smoke`;
  console.log(`${name}: relay at ${url}`);
  enter(`${name} connect`);
  const clients = [0, 1].map(() => {
    const transport = createWebSocketTransport({ url });
    const client = createPresenceClient({ transport });
    void transport.connect();
    return client;
  });
  const [a, b] = clients;
  if (a === undefined || b === undefined) throw new Error("no clients");
  await waitFor(() => a.getStatus() === "connected" && b.getStatus() === "connected", phase);
  enter(`${name} delivery`);
  a.setLocalCursor({ anchors: [{ id: "a", u: 0.5, v: 0.5 }] });
  await waitFor(() => b.getRemoteSnapshot().length === 1, phase);
  enter(`${name} dispose`);
  for (const client of clients) client.dispose();
  enter(`${name} close`);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const closed = await Promise.race([
    relay.close().then(() => true),
    new Promise<false>((resolve) => {
      timer = setTimeout(() => resolve(false), 5000);
    }),
  ]);
  clearTimeout(timer);
  if (!closed) throw new Error(`timed out: ${phase}`);
  console.log(`ok: ${name} relay under ${runtime}`);
}

try {
  enter("bun-native start");
  await check("bun-native", createBunRelay(0));
  enter("node-ws start");
  await check("node-ws", await createNodeWsRelay(0));
  process.exit(0);
} catch (error) {
  console.error(`runtime smoke test failed in phase: ${phase} (${runtime})`, error);
  process.exit(1);
}
