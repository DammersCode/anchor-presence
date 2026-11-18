import { demoIdentityOptions } from "../_shared/relay-guard.js";
import { createElysiaRelay } from "./server.js";

// Usage: bun relay.ts [port]
const port = Number(process.argv[2] ?? 8791);
const relay = createElysiaRelay(port, demoIdentityOptions());
console.log(`elysia relay listening on ${relay.url.replace("http", "ws")}/?room=main`);
