import { createSignalRClient, event, method } from "@dammers/use-signalr-react";

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
