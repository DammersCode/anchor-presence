import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { LiveCursorProvider } from "@anchor-presence/react";
import { SignalRProvider } from "./signalr";
import { usePresence, SERVER_URL } from "./usePresence";
import { App } from "./App";

// Bridges the two provider trees: the use-signalr context (useSignalR) feeds the
// presence client, whose LiveCursorProvider powers the App's cursor hooks.
function PresenceRoot() {
  const client = usePresence();
  return (
    <LiveCursorProvider client={client}>
      <App />
    </LiveCursorProvider>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <SignalRProvider baseUrl={SERVER_URL} accessTokenFactory={() => ""}>
      <PresenceRoot />
    </SignalRProvider>
  </StrictMode>,
);
