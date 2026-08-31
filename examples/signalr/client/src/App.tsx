import { useCallback, useState, type ReactNode, type Ref } from "react";
import { CursorLayer, useCursorAnchor, useCursorStatus } from "@anchor-presence/react";
import type { DemoContext, DemoUser } from "./usePresence";

// useCursorAnchor's ref callback is typed as (Element | null) => void; the cast makes it
// usable as a regular element ref so the cards stay terse.
function anchor(id: string): Ref<HTMLDivElement> {
  return useCursorAnchor(id) as Ref<HTMLDivElement>;
}

function Label({ children }: { children: ReactNode }) {
  return <h2>{children}</h2>;
}

export function App() {
  const [view, setView] = useState<"overview" | "metrics">("overview");
  const status = useCursorStatus();
  const overviewRef = anchor("overview-card");
  const metricsRef = anchor("metrics-card");
  const tagsRef = anchor("tags-card");

  const select = useCallback((next: "overview" | "metrics") => setView(next), []);

  return (
    <div className="shell">
      <header>
        <h1>anchor-presence — SignalR</h1>
        <span className="status" data-testid="hub-status">
          hub: {status}
        </span>
        <span className="status" style={{ marginLeft: "auto" }}>
          open a second window to see two cursors
        </span>
      </header>

      <main>
        {view === "overview" ? (
          <section className="card" ref={overviewRef} data-testid="overview-anchor">
            <Label>Live cursors on semantic anchors</Label>
            <p>
              A minimal .NET 10 ASP.NET Core server relays every received presence payload to all
              other connections. It keeps no state and never parses the payload.
            </p>
            <p>
              Cursor updates travel as a JSON string over the <code>OnPresence</code> hub method and
              come back as <code>PresenceReceived</code> events.
            </p>
            <div className="meter">
              <span className="meter-fill" />
            </div>
            <p>
              Move the pointer inside this card. A second window draws the same cursor anchored to
              this element, so it survives a different window width.
            </p>
          </section>
        ) : (
          <section className="card" ref={metricsRef} data-testid="metrics-anchor">
            <Label>SignalR relay, receiver-authoritative</Label>
            <p>
              The relay never validates. This client validates every received payload against the
              presence schema, then resolves the cursor onto the local layout.
            </p>
            <div className="meter">
              <span className="meter-fill-alt" />
            </div>
            <p>
              A cursor position is a normalized (u, v) offset per anchored element. The receiver
              multiplies it by its own element size, so the cursor follows the element when two
              windows have different widths.
            </p>
          </section>
        )}

        <div className="column">
          <section className="card">
            <Label>Try it</Label>
            <p>Start the server and this client twice, then:</p>
            <p>1. Move a pointer inside a card in one window.</p>
            <p>2. Resize the other window. The cursor follows the element.</p>
            <p>3. Close a window. Its cursor goes stale and is removed.</p>
          </section>

          <div className="card" ref={tagsRef} data-testid="tags-anchor">
            <Label>Anchored elements</Label>
            <div className="tags">
              <span className="tag">overview-card</span>
              <span className="tag">metrics-card</span>
              <span className="tag">tags-card</span>
            </div>
            <p>
              Each card is a cursor anchor. The cursor anchors to the deepest anchor under the
              pointer, up to four elements in the registry chain.
            </p>
          </div>

          <section className="card">
            <Label>Switch view</Label>
            <div className="tags">
              <button className="tag" type="button" onClick={() => select("overview")}>
                overview
              </button>
              <button className="tag" type="button" onClick={() => select("metrics")}>
                metrics
              </button>
            </div>
            <p>
              Switching the main card changes which element the cursor anchors to. The other window
              resolves the same anchor in its own layout.
            </p>
          </section>
        </div>
      </main>

      <div className="foot">
        use-signalr · @microsoft/signalr · @anchor-presence/core · @anchor-presence/react · .NET 10
        SignalR relay
      </div>

      <CursorLayer<DemoContext, DemoUser> />
    </div>
  );
}
