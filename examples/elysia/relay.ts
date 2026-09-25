import { createElysiaRelay } from "./server.js";

// Standalone entry: `bun run dev:relay`. Listens on 8791.
const port = Number(process.argv[2] ?? 8791);
const relay = createElysiaRelay(port);
console.log(`elysia relay listening on ${relay.url}`);
