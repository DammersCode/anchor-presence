import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { LiveCursorProvider } from "@anchor-presence/react";
import App from "./App";
import { BenchPage } from "./bench/BenchPage";
import { ReflowBenchPage } from "./reflow/ReflowBenchPage";
import { getPresenceClient } from "./cursors/setup";
import { createVisibilityPolicy } from "./cursors/visibilityPolicy";
import type { LocalViewState } from "./cursors/visibilityPolicy";
import { interpolatorRegistry } from "./cursors/interpolators";
import { useInterpolatorStyle } from "./useInterpolatorStyle";

// Query-param routing (?page=bench) — no router dependency, per requirement 7.
const isBenchRoute = new URLSearchParams(window.location.search).get("page") === "bench";
const isReflowBenchRoute = new URLSearchParams(window.location.search).get("page") === "reflow-bench";

// App's context effect is the single writer; the policy reads it synchronously each resolution.
const localViewState: LocalViewState = { page: null, settingsOpen: false };
const visibilityPolicy = createVisibilityPolicy(() => localViewState);

function Root() {
  const [interpolatorStyle, selectInterpolatorStyle] = useInterpolatorStyle();
  if (isBenchRoute) return <BenchPage />;
  if (isReflowBenchRoute) return <ReflowBenchPage />;

  const client = getPresenceClient();
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
        onInterpolatorStyleChange={selectInterpolatorStyle}
      />
    </LiveCursorProvider>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
