import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LiveCursorProvider } from "../src/provider";
import {
  useCursorAnchor,
  useCursorClient,
  useCursorContext,
  useCursorPresence,
  useCursorStatus,
  useRemoteCursors,
} from "../src/hooks";

function AllHooks() {
  const ref = useCursorAnchor("a");
  const cursors = useRemoteCursors();
  const presence = useCursorPresence();
  const status = useCursorStatus();
  const client = useCursorClient();
  const [context] = useCursorContext();
  return (
    <div ref={ref}>
      <span data-testid="cursors">{cursors.length}</span>
      <span data-testid="presence">{presence.length}</span>
      <span data-testid="status">{status}</span>
      <span data-testid="client">{client === null ? "null" : "present"}</span>
      <span data-testid="context">{context === undefined ? "undefined" : String(context)}</span>
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
  });
});
