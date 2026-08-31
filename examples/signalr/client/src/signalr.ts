import { createSignalRClient, event, method } from "@dammers/use-signalr-react";

// Dev origin of the C# relay; override with ?server=http://host:port when needed.
export const SERVER_URL =
  new URLSearchParams(window.location.search).get("server") ?? "http://localhost:5000";

export const { SignalRProvider, useSignalR } = createSignalRClient({
  hubs: {
    "/hubs/presence": {
      events: {
        PresenceReceived: event<[payload: string]>(),
      },
      methods: {
        OnPresence: method<[payload: string]>(),
      },
      reconnect: true,
    },
  },
});
