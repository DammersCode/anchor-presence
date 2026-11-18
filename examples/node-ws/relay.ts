import { demoIdentityOptions } from "../_shared/relay-guard.ts";
import { createNodeWsRelay } from "./server.ts";

// Usage: node relay.ts [port] or bun relay.ts [port]
const port = Number(process.argv[2] ?? process.env.PORT ?? 8789);
const relay = await createNodeWsRelay(port, demoIdentityOptions());
console.log(`node-ws relay listening on ${relay.url.replace("http", "ws")}/?room=main`);
