import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { LiveCursorProvider } from "@anchor-presence/react";
import App from "./App";
import { BenchPage } from "./bench/BenchPage";
import { getPresenceClient } from "./cursors/setup";
import { settingsAwareVisibilityPolicy } from "./cursors/visibilityPolicy";

// Query-param routing (?page=bench) — no router dependency, per requirement 7.
const isBenchRoute = new URLSearchParams(window.location.search).get("page") === "bench";

function Root() {
  if (isBenchRoute) return <BenchPage />;

  const client = getPresenceClient();
  return (
    <LiveCursorProvider client={client} bindingOptions={{ visibilityPolicy: settingsAwareVisibilityPolicy }}>
      <App />
    </LiveCursorProvider>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
