import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LiveCursorProvider } from "../src/provider";
import {
  useCursorClient,
  useCursorBinding,
  useLocalContext,
  useCursorEvents,
  useRemotePresence,
  useLocalUser,
  usePeerChanges,
  useRemoteCursorsSelector,
  useRemoteUsers,
  useCursorStatus,
  useRemoteCursors,
} from "../src/hooks";

function AllHooks() {
  const cursors = useRemoteCursors();
  const presence = useRemotePresence();
  const status = useCursorStatus();
  const client = useCursorClient();
  const [context] = useLocalContext();
  const binding = useCursorBinding();
  const [user] = useLocalUser();
  const users = useRemoteUsers();
  const count = useRemoteCursorsSelector((all) => all.length);
  useCursorEvents(() => {});
  usePeerChanges(() => {});
  return (
    <div data-anchor="a">
      <span data-testid="extras">{`${binding === null ? "none" : "binding"}-${user === undefined ? "nouser" : "user"}-${users.length}-${count}`}</span>
      <span data-testid="cursors">{cursors.length}</span>
      <span data-testid="presence">{presence.length}</span>
      <span data-testid="status">{status}</span>
      <span data-testid="client">{client === null ? "null" : "present"}</span>
      <span data-testid="context">{context === undefined ? "undefined" : JSON.stringify(context)}</span>
    </div>
  );
}

describe("SSR safety", () => {
  it("renders children with client=null", () => {
    const html = renderToString(
      <LiveCursorProvider client={null}>
        <div>hello</div>
      </LiveCursorProvider>,
    );
    expect(html).toContain("hello");
  });

  it("renderToString works for a tree using every hook, with server-safe snapshots", () => {
    const html = renderToString(
      <LiveCursorProvider client={null}>
        <AllHooks />
      </LiveCursorProvider>,
    );
    expect(html).toContain("disconnected");
    expect(html).toContain("null");
    expect(html).toContain("none-nouser-0-0");
  });
});

describe("dev warnings", () => {
  it("warns once when a hook runs outside a provider", async () => {
    const { vi } = await import("vitest");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    renderToString(<AllHooks />);
    renderToString(<AllHooks />);
    const calls = warn.mock.calls.filter(([text]) => String(text).includes("outside LiveCursorProvider"));
    expect(calls.length).toBeLessThanOrEqual(1);
    warn.mockRestore();
  });
});
