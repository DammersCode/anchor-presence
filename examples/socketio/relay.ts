import { createSocketIoRelay } from "./server.js";

// Usage: bun relay.ts [port]
const port = Number(process.argv[2] ?? 5001);
const relay = await createSocketIoRelay(port);
console.log(`socketio relay listening on ${relay.url}`);
