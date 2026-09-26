import { createElysiaRelay } from "./server.js";

// Usage: bun relay.ts [port]
const port = Number(process.argv[2] ?? 8791);
const relay = createElysiaRelay(port);
console.log(`elysia relay listening on ${relay.url}`);
