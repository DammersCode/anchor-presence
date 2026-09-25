import { createBunRelay } from "./server.js";

// Standalone entry: `bun run dev:relay`. Listens on 8788 (apps/server's relay uses 8787).
const port = Number(process.argv[2] ?? 8788);
const relay = createBunRelay(port);
console.log(`bun-native relay listening on ${relay.url}`);
