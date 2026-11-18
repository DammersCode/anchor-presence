import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createPresenceClient } from "@anchor-presence/core";
import "./index.css";
import App from "./app";
import { BenchPage } from "./bench/bench-page";
import { ReflowBenchPage } from "./reflow/reflow-bench-page";
import { createBackendTransport } from "./cursors/backends";
import { backendId, colorForName, localRoom, localUserName } from "./cursors/setup";
import { parseDemoEvent, parseDemoUser } from "./cursors/setup";
import type { DemoContext, DemoUser } from "./cursors/setup";
import { createVisibilityPolicy } from "./cursors/visibility-policy";
import type { LocalViewState } from "./cursors/visibility-policy";
import { LiveCursorProvider } from "./cursors/hooks";
import { interpolatorRegistry } from "./cursors/interpolators";
import { useInterpolatorStyle } from "./use-interpolator-style";

// Query-param routing (?page=bench) — no router dependency, per requirement 7.
const isBenchRoute = new URLSearchParams(window.location.search).get("page") === "bench";
const isReflowBenchRoute = new URLSearchParams(window.location.search).get("page") === "reflow-bench";

// App's context effect is the single writer; the policy reads it synchronously each resolution.
const localViewState: LocalViewState = { page: null, settingsOpen: false };
const visibilityPolicy = createVisibilityPolicy(() => localViewState);

function createDemoClient() {
  const { transport, codec } = createBackendTransport(backendId, localRoom);
  return createPresenceClient<DemoContext, DemoUser>({
    transport,
    codec,
    user: { name: localUserName, color: colorForName(localUserName) },
    parseUser: parseDemoUser,
    parseEvent: (event) => (parseDemoEvent(event) === undefined ? undefined : event),
  });
}

function Root() {
  const [interpolatorStyle, selectInterpolatorStyle] = useInterpolatorStyle();
  if (isBenchRoute) return <BenchPage />;
  if (isReflowBenchRoute) return <ReflowBenchPage />;

  return (
    <LiveCursorProvider
      bindingKey={interpolatorStyle}
      factory={createDemoClient}
      bindingOptions={{
        captureFocus: true,
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
