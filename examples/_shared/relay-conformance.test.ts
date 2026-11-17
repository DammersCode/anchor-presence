import { defineRelayConformance, type ConformanceRelay } from "./relay-conformance-suite";
import { spawnBunRelay, spawnReferenceRelay } from "./relay-test-helpers";

async function startExample(example: string, env: Record<string, string>): Promise<ConformanceRelay> {
  const relay = example === "reference" ? await spawnReferenceRelay(env) : await spawnBunRelay(example, env);
  return { baseUrl: `ws://127.0.0.1:${relay.port}`, stop: relay.stop };
}

for (const example of ["reference", "bun-native", "hono", "elysia", "node-ws"]) {
  defineRelayConformance(example, (env) => startExample(example, env));
}
