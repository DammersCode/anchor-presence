import { demoIdentityOptions } from "../_shared/relay-guard.js";
import { createNodeWsRelay } from "./server.js";

// Usage: bun relay.ts [port]
const port = Number(process.argv[2] ?? 8789);
const relay = await createNodeWsRelay(port, demoIdentityOptions());
console.log(`node-ws relay listening on ${relay.url}`);
