// A typed client for the Elysia relay. Eden builds the socket from the treaty, so the query
// parameters are checked against the relay's query schema at compile time.
import { createPresenceClient } from "@anchor-presence/core";
import { createWebSocketTransport, type WebSocketCtor } from "@anchor-presence/dom";
import { treaty } from "@elysia/eden";
import type { ElysiaRelayApp } from "./server.js";

/**
 * Creates a presence client for one room of an Elysia relay.
 * @param baseUrl The relay origin, for example `http://localhost:8791`.
 * @param room The room name, checked against the relay's query schema.
 * @param token The room token, when the relay sets `RELAY_AUTH_TOKEN`.
 */
export function createElysiaClient(baseUrl: string, room: string, token?: string) {
  const relay = treaty<ElysiaRelayApp>(baseUrl);
  // Eden builds the real url from the treaty; the transport only needs a url outside the browser.
  // `EdenWS.ws` is the platform WebSocket; the Eden wrapper alone has no onopen or onmessage.
  const edenSocket = function () {
    return relay.subscribe({ query: token === undefined ? { room } : { room, token } }).ws;
  } as unknown as WebSocketCtor;
  const transport = createWebSocketTransport({
    url: baseUrl.replace(/^http/u, "ws"),
    WebSocketCtor: edenSocket,
  });
  const client = createPresenceClient({ transport });
  transport.connect();
  return { client, transport };
}
