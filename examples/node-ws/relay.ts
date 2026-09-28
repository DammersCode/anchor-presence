import { createNodeWsRelay } from "./server.js";

// Usage: bun relay.ts [port]
const port = Number(process.argv[2] ?? 8789);
const relay = await createNodeWsRelay(port);
console.log(`node-ws relay listening on ${relay.url}`);
