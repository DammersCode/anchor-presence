import { createSocketIoRelay } from "./server.js";

// Standalone entry: `bun run dev:relay`. Listens on 5001 (apps/demo's relay uses 8787).
const port = Number(process.argv[2] ?? 5001);
const relay = await createSocketIoRelay(port);
console.log(`socketio relay listening on ${relay.url}`);
