import { createHonoRelay } from "./server.js";

// Usage: bun relay.ts [port]
const port = Number(process.argv[2] ?? 8790);
const relay = createHonoRelay(port);
console.log(`hono relay listening on ${relay.url}`);
