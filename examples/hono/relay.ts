import { createHonoRelay } from "./server.js";

// Standalone entry: `bun run dev:relay`. Listens on 8790.
const port = Number(process.argv[2] ?? 8790);
const relay = createHonoRelay(port);
console.log(`hono relay listening on ${relay.url}`);
