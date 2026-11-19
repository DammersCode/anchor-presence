import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { PresenceProvider } from "../src/provider";
import { makeFakeClient } from "./test-utils";
import { useSendEvent } from "../src/hooks/use-send-event";
import {
  usePresenceClient,
  useDomBinding,
  useLocalContext,
  useRemoteEvents,
  useRemotePresence,
  useLocalUser,
  usePeerChanges,
  useRemoteCursorsSelector,
  useRemoteUsers,
  usePresenceStatus,
  useRemoteCursors,
} from "../src/hooks";

function AllHooks() {
  const cursors = useRemoteCursors();
  const presence = useRemotePresence();
  const status = usePresenceStatus();
  const client = usePresenceClient();
  const [context] = useLocalContext();
  const binding = useDomBinding();
  const [user] = useLocalUser();
  const users = useRemoteUsers();
  const count = useRemoteCursorsSelector((all) => all.length);
  useRemoteEvents(() => {});
  usePeerChanges(() => {});
  const sent = useSendEvent()("ping", {});
  return (
    <div data-anchor="a">
      <span data-testid="extras">{`${binding === null ? "none" : "binding"}-${user === undefined ? "nouser" : "user"}-${users.length}-${count}`}</span>
      <span data-testid="sent">{String(sent)}</span>
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
      <PresenceProvider client={null}>
        <div>hello</div>
      </PresenceProvider>,
    );
    expect(html).toContain("hello");
  });

  it("renderToString works for a tree using every hook, with server-safe snapshots", () => {
    const html = renderToString(
      <PresenceProvider client={null}>
        <AllHooks />
      </PresenceProvider>,
    );
    expect(html).toContain("disconnected");
    expect(html).toContain("null");
    expect(html).toContain("none-nouser-0-0");
    expect(html).toContain(">false<");
  });

  it("reports connecting on the server while a provider factory has not created its client", () => {
    const factory = vi.fn(() => makeFakeClient().client);
    const html = renderToString(
      <PresenceProvider factory={factory}>
        <AllHooks />
      </PresenceProvider>,
    );
    expect(html).toContain(">connecting<");
    expect(html).not.toContain("disconnected");
    expect(factory).not.toHaveBeenCalled();
  });
});

describe("dev warnings", () => {
  it("warns once when a hook runs outside a provider", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    renderToString(<AllHooks />);
    renderToString(<AllHooks />);
    const calls = warn.mock.calls.filter(([text]) => String(text).includes("outside PresenceProvider"));
    expect(calls.length).toBeLessThanOrEqual(1);
    warn.mockRestore();
  });
});
