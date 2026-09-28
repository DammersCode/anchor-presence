// A typed client for the Elysia relay. Eden builds the socket from the treaty, so the query
// parameters are checked against the relay's query schema at compile time.
import { createPresenceClient } from "@anchor-presence/core";
import { createWebSocketTransport, type WebSocketCtor } from "@anchor-presence/dom";
import { treaty } from "@elysia/eden";
import type { ElysiaRelayApp } from "./server.js";

const relay = treaty<ElysiaRelayApp>("http://localhost:8791");

// A fresh Eden socket per connection. The transport ignores the url argument, because Eden builds
// the url from the treaty base and the typed query.
function edenSocket() {
  return relay.subscribe({ query: { room: "main" } });
}

const transport = createWebSocketTransport({
  WebSocketCtor: edenSocket as unknown as WebSocketCtor,
});

const client = createPresenceClient({ transport });
transport.connect();

export { client, transport };
