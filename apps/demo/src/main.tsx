import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createPresenceClient } from "@dammers/anchor-presence-core";
import "./index.css";
import App from "./app";
import { InMemoryRoomPage } from "./fixtures/in-memory-room-page";
import { CorePrimitivesPage } from "./fixtures/core-primitives-page";
import { FieldTestPage } from "./field-test";
import { BenchPage } from "./bench/bench-page";
import { ReflowBenchPage } from "./reflow/reflow-bench-page";
import { createBackendTransport } from "./cursors/backends";
import { backendId, colorForName, localRoom, localUserName } from "./cursors/setup";
import { parseDemoContext, parseDemoEvents, parseDemoUser } from "./cursors/setup";
import type { DemoContext, DemoEvents, DemoUser } from "./cursors/setup";
import { createVisibilityPolicy } from "./cursors/visibility-policy";
import type { LocalViewState } from "./cursors/visibility-policy";
import { PresenceProvider } from "./cursors/hooks";
import { interpolatorRegistry } from "./cursors/interpolators";
import { useInterpolatorStyle } from "./use-interpolator-style";

// Query-param routing (?page=bench) — no router dependency, per requirement 7.
const isBenchRoute = new URLSearchParams(window.location.search).get("page") === "bench";
const isFieldTestRoute = new URLSearchParams(window.location.search).get("page") === "field-test";
const isReflowBenchRoute = new URLSearchParams(window.location.search).get("page") === "reflow-bench";

// App's context effect is the single writer; the policy reads it synchronously each resolution.
const localViewState: LocalViewState = { page: null, settingsOpen: false };
const visibilityPolicy = createVisibilityPolicy(() => localViewState);

const isInMemoryRoomRoute = new URLSearchParams(window.location.search).get("page") === "in-memory-room";

const isCorePrimitivesRoute = new URLSearchParams(window.location.search).get("page") === "core-primitives";

function createDemoClient() {
  const { transport, codec } = createBackendTransport(backendId, localRoom);
  return createPresenceClient<DemoContext, DemoUser, DemoEvents>({
    transport,
    codec,
    user: { name: localUserName, color: colorForName(localUserName) },
    parseContext: parseDemoContext,
    parseUser: parseDemoUser,
    parseEvent: parseDemoEvents,
  });
}

function Root() {
  const [interpolatorStyle, selectInterpolatorStyle] = useInterpolatorStyle();
  if (isInMemoryRoomRoute) return <InMemoryRoomPage />;
  if (isCorePrimitivesRoute) return <CorePrimitivesPage />;
  if (isFieldTestRoute) return <FieldTestPage />;
  if (isBenchRoute) return <BenchPage />;
  if (isReflowBenchRoute) return <ReflowBenchPage />;

  return (
    <PresenceProvider
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
    </PresenceProvider>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
