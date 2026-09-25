import { createNodeWsRelay } from "./server.js";

// Standalone entry: `bun run dev:relay`. Listens on 8789.
const port = Number(process.argv[2] ?? 8789);
const relay = await createNodeWsRelay(port);
console.log(`node-ws relay listening on ${relay.url}`);
