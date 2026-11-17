import { demoIdentityOptions } from "../_shared/relay-guard.js";
import { createBunRelay } from "./server.js";

// Usage: bun relay.ts [port]
const port = Number(process.argv[2] ?? 8788);
const relay = createBunRelay(port, demoIdentityOptions());
console.log(`bun-native relay listening on ${relay.url}`);
