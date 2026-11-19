import { useContext, useState } from "react";
import { createEventChannel, createInMemoryRoom, createPresenceClient } from "@anchor-presence/core";
import type { InMemoryRoom } from "@anchor-presence/core";
import {
  CursorLayer,
  DefaultCursor,
  PresenceProvider,
  PresenceProviderContext,
  useRemoteEvents,
  useSendEvent,
} from "@anchor-presence/react";

const NAMES = ["Ada", "Bo", "Cy"] as const;
type Name = (typeof NAMES)[number];

const COLORS: Record<Name, string> = { Ada: "#2563eb", Bo: "#dc2626", Cy: "#16a34a" };

function nameOf(user: unknown): Name {
  const name = (user as { name?: Name } | undefined)?.name;
  return name ?? "Ada";
}

function ContextProbe({ name }: { name: Name }) {
  const { client, binding } = useContext(PresenceProviderContext);
  return (
    <span data-testid={`context-${name}`}>{client !== null && binding !== null ? "ready" : "empty"}</span>
  );
}

function Events({ name }: { name: Name }) {
  const { client } = useContext(PresenceProviderContext);
  const send = useSendEvent();
  const [received, setReceived] = useState<string[]>([]);
  useRemoteEvents((event) => setReceived((current) => [...current, `${event.type}`]));
  return (
    <div>
      <button
        type="button"
        data-testid={`ping-${name}`}
        onClick={() => {
          if (client !== null) createEventChannel(client).send("ping", { from: name });
          send("pong", { from: name });
        }}
      >
        Ping
      </button>
      <span data-testid={`events-${name}`}>{received.join(",")}</span>
    </div>
  );
}

function Pane({ name, room }: { name: Name; room: InMemoryRoom }) {
  const attribute = `data-room-${name.toLowerCase()}`;
  return (
    <PresenceProvider
      factory={() => createPresenceClient({ transport: room.join(), user: { name } })}
      bindingOptions={{ anchorAttribute: attribute }}
    >
      <section data-testid={`pane-${name}`} style={{ flex: 1, padding: 16, border: "1px solid #999" }}>
        <h2>{name}</h2>
        <div
          {...{ [attribute]: "box" }}
          data-testid={`box-${name}`}
          style={{ height: 160, background: "#eef" }}
        />
        <ContextProbe name={name} />
        <Events name={name} />
        <CursorLayer
          getLabel={(cursor) => nameOf(cursor.user)}
          getColor={(cursor) => COLORS[nameOf(cursor.user)]}
          getCursorProps={(cursor) => ({ id: `cursor-${name}-${nameOf(cursor.user)}` })}
          renderCursor={({ label, color }) => <DefaultCursor label={label} color={color} />}
        />
      </section>
    </PresenceProvider>
  );
}

export function InMemoryRoomPage() {
  const [room] = useState(() => createInMemoryRoom());
  return (
    <main style={{ display: "flex", gap: 16 }}>
      {NAMES.map((name) => (
        <Pane key={name} name={name} room={room} />
      ))}
    </main>
  );
}
