// Type-checked copy of the sample in apps/docs/content/docs/examples/backends/signalr.mdx (Share a use-signalr connection).
// It lives in the demo because only the demo declares @dammers/use-signalr-react; `bun run typecheck` compiles it.
import { createSignalRClient, event, method } from "@dammers/use-signalr-react";
import type { createSignalRTransport } from "../../../../examples/signalr/transport";

export const { SignalRProvider, useSignalR } = createSignalRClient({
  hubs: {
    "/hubs/presence": {
      events: { PresenceReceived: event<[payload: string]>() },
      methods: { OnPresence: method<[payload: string]>() },
    },
    // your app's other hubs
  },
});

type Connection = NonNullable<ReturnType<ReturnType<typeof useSignalR>["getConnection"]>>;

// the connection of the shared hook must be accepted by the SignalR transport
export const acceptsConnection: (connection: Connection) => Parameters<typeof createSignalRTransport>[0] = (
  connection,
) => connection;
