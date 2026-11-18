import { act } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { StrictMode } from "react";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import {
  createMemoryRouter,
  MemoryRouter,
  Route,
  Routes,
  RouterProvider as ReactRouterProvider,
  Link as RrLink,
  Outlet as RrOutlet,
} from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { createInMemoryPair, createPresenceClient } from "@anchor-presence/core";
import { CursorLayer, LiveCursorProvider, useCursorStatus } from "../src";

function Shell() {
  const status = useCursorStatus();
  return (
    <div>
      <span data-testid="status">{status}</span>
      <CursorLayer />
    </div>
  );
}

function makeFactory(created: { count: number; disposed: number }) {
  return () => {
    created.count += 1;
    const { a } = createInMemoryPair();
    const client = createPresenceClient({ transport: a });
    const dispose = client.dispose.bind(client);
    client.dispose = () => {
      created.disposed += 1;
      dispose();
    };
    return client;
  };
}

let container: HTMLDivElement | null = null;
afterEach(() => {
  container?.remove();
  container = null;
});

describe("TanStack Router (also the router of TanStack Start)", () => {
  function buildRouter(factory: () => ReturnType<typeof createPresenceClient>, url: string) {
    const rootRoute = createRootRoute({
      component: () => (
        <LiveCursorProvider factory={factory}>
          <Shell />
          <Link to="/other">other</Link>
          <Outlet />
        </LiveCursorProvider>
      ),
    });
    const home = createRoute({ getParentRoute: () => rootRoute, path: "/", component: () => <p>home</p> });
    const other = createRoute({
      getParentRoute: () => rootRoute,
      path: "/other",
      component: () => <p>other page</p>,
    });
    return createRouter({
      routeTree: rootRoute.addChildren([home, other]),
      history: createMemoryHistory({ initialEntries: [url] }),
    });
  }

  it("renders on the server without a client and hydrates without a mismatch", async () => {
    const created = { count: 0, disposed: 0 };
    const router = buildRouter(makeFactory(created), "/");
    await router.load();
    const html = renderToString(<RouterProvider router={router} />);
    expect(html).toContain("connecting");
    expect(created.count).toBe(0);

    container = document.createElement("div");
    document.body.append(container);
    container.innerHTML = html;
    const errors: unknown[] = [];
    const clientRouter = buildRouter(makeFactory(created), "/");
    await clientRouter.load();
    act(() => {
      hydrateRoot(
        container!,
        <StrictMode>
          <RouterProvider router={clientRouter} />
        </StrictMode>,
        { onRecoverableError: (error) => errors.push(error) },
      );
    });
    expect(errors).toEqual([]);
    expect(created.count).toBeGreaterThanOrEqual(1);
  });

  it("keeps one client across a navigation", async () => {
    const created = { count: 0, disposed: 0 };
    const router = buildRouter(makeFactory(created), "/");
    await router.load();
    container = document.createElement("div");
    document.body.append(container);
    const { createRoot } = await import("react-dom/client");
    const root = createRoot(container);
    act(() => root.render(<RouterProvider router={router} />));
    const countAfterMount = created.count;
    expect(countAfterMount).toBe(1);
    await act(async () => {
      await router.navigate({ to: "/other" });
    });
    expect(container.textContent).toContain("other page");
    expect(created.count).toBe(countAfterMount);
    expect(created.disposed).toBe(0);
    act(() => root.unmount());
    expect(created.disposed).toBe(created.count);
  });
});

describe("React Router (also the router of Remix)", () => {
  it("renders on the server inside a router", () => {
    const html = renderToString(
      <MemoryRouter initialEntries={["/"]}>
        <LiveCursorProvider client={null}>
          <Shell />
          <Routes>
            <Route path="/" element={<p>home</p>} />
          </Routes>
        </LiveCursorProvider>
      </MemoryRouter>,
    );
    expect(html).toContain("disconnected");
  });

  it("keeps one client across a navigation", async () => {
    const created = { count: 0, disposed: 0 };
    const factory = makeFactory(created);
    const router = createMemoryRouter(
      [
        {
          path: "/",
          element: (
            <LiveCursorProvider factory={factory}>
              <Shell />
              <RrLink to="/other">other</RrLink>
              <RrOutlet />
            </LiveCursorProvider>
          ),
          children: [
            { index: true, element: <p>home</p> },
            { path: "other", element: <p>other page</p> },
          ],
        },
      ],
      { initialEntries: ["/"] },
    );
    container = document.createElement("div");
    document.body.append(container);
    const { createRoot } = await import("react-dom/client");
    const root = createRoot(container);
    act(() => root.render(<ReactRouterProvider router={router} />));
    const countAfterMount = created.count;
    expect(countAfterMount).toBe(1);
    await act(async () => {
      await router.navigate("/other");
    });
    expect(container.textContent).toContain("other page");
    expect(created.count).toBe(countAfterMount);
    expect(created.disposed).toBe(0);
    act(() => root.unmount());
  });
});
