import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { LiveCursorProvider } from "@anchor-presence/react";
import App from "./App";
import { BenchPage } from "./bench/BenchPage";
import { getPresenceClient } from "./cursors/setup";
import { SignalRProvider, useSignalR, SERVER_URL } from "./signalr";
import { createVisibilityPolicy } from "./cursors/visibilityPolicy";
import type { LocalViewState } from "./cursors/visibilityPolicy";
import { interpolatorRegistry, type InterpolatorStyle } from "./cursors/interpolators";
import { useInterpolatorStyle } from "./useInterpolatorStyle";

// Query-param routing (?page=bench) — no router dependency, per requirement 7.
const isBenchRoute = new URLSearchParams(window.location.search).get("page") === "bench";

// App's context effect is the single writer; the policy reads it synchronously each resolution.
const localViewState: LocalViewState = { page: null, settingsOpen: false };
const visibilityPolicy = createVisibilityPolicy(() => localViewState);

// Bridges the two provider trees: the use-signalr context feeds the presence
// client; `LiveCursorProvider` then powers the copied demo UI's cursor hooks.
function Root() {
  const [interpolatorStyle, selectInterpolatorStyle] = useInterpolatorStyle();
  if (isBenchRoute) return <BenchPage />;

  return (
    <PresenceRoot
      interpolatorStyle={interpolatorStyle}
      onInterpolatorStyleChange={selectInterpolatorStyle}
    />
  );
}

function PresenceRoot({
  interpolatorStyle,
  onInterpolatorStyleChange,
}: {
  interpolatorStyle: InterpolatorStyle;
  onInterpolatorStyleChange: (style: InterpolatorStyle) => void;
}) {
  const ctx = useSignalR();
  const client = getPresenceClient(ctx);
  return (
    // key={interpolatorStyle} forces a remount: bindingOptions is read once per binding (see provider.tsx), so a style
    // change must recreate the whole provider subtree rather than mutate the existing binding in place.
    <LiveCursorProvider
      key={interpolatorStyle}
      client={client}
      bindingOptions={{
        resolution: {
          visibilityPolicy,
          interpolatorFactory: interpolatorRegistry[interpolatorStyle],
        },
      }}
    >
      <App
        localViewState={localViewState}
        interpolatorStyle={interpolatorStyle}
        onInterpolatorStyleChange={onInterpolatorStyleChange}
      />
    </LiveCursorProvider>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <SignalRProvider baseUrl={SERVER_URL} accessTokenFactory={() => ""}>
      <Root />
    </SignalRProvider>
  </StrictMode>,
);
