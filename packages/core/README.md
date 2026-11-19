# @anchor-presence/core

`@anchor-presence/core` is the protocol and orchestration layer of Anchor Presence. It holds the wire types, the validation rules, the presence store, and the client that ties them together.

[![MIT](https://img.shields.io/badge/license-MIT-blue.svg)](../../LICENSE)

This sample creates a client, publishes a cursor, and logs each remote change:

```ts
import { createPresenceClient, jsonCodec } from "@anchor-presence/core";

const client = createPresenceClient({
  transport: myTransport,
  codec: jsonCodec, // default; pass a custom PresenceCodec for a different wire format
  publishIntervalMs: 50,
});

client.setLocalCursor({ anchors: [{ id: "nav.dashboard", u: 0.5, v: 0.5 }] });
client.subscribeRemote(() => {
  console.log(client.getRemoteSnapshot());
});
```

`getRemoteSnapshot()` returns the raw snapshot, including `sequence`, and changes identity on every accepted message. `getRemotePresence()` returns the stable snapshot, which excludes `sequence` and holds identity until an observable field changes.

The client calls `transport.connect()` for you by default. To connect at a time that you choose, pass `autoConnect: false` and call `transport.connect()` yourself.

## Boundary rule

`@anchor-presence/core` imports no DOM, React, transport, or codec library. It reads `document` only when it exists, to send a pending publish when the page becomes visible. Every other browser API call lives in `@anchor-presence/dom`.

## Main exports

| Export                                                              | What it does                                                                                              |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `createPresenceClient(options)`                                     | Wires the transport, codec, publishing, sequencing, expiry, and the remote presence store into one client |
| `PresenceMessage`, `AnchorPoint`, `CursorPosition`                  | Wire protocol types                                                                                       |
| `RemotePresence`                                                    | A remote presence without `sequence`. It is the shape of an entry in the stable snapshot.                 |
| `validatePresence(input, limits?)`                                  | Checks and clamps an untrusted decoded value                                                              |
| `jsonCodec`                                                         | The default `PresenceCodec` implementation                                                                |
| `binaryCodec`                                                       | A compact `PresenceCodec` for binary WebSocket relays                                                     |
| `PresenceTransport`, `ConnectionStatus`                             | The transport interface                                                                                   |
| `AdaptivePublishOptions`                                            | Opt-in slow-mode options for the publish rate                                                             |
| `createInMemoryPair`                                                | A connected pair of in-memory transports for tests                                                        |
| `RemotePresenceStore`                                               | Sequencing, field-delta merge, and stale-expiry store for remote presences                                |
| `createEventChannel(client)`                                        | Typed `send` and `subscribe` for the events of a client                                                   |
| `createEventParser(parsers)`, `EventParsers`                        | Builds a typed `parseEvent` from one data parser per event type                                           |
| `client.sendEvent(type, data?)`, `client.subscribeEvents(listener)` | One-shot events, such as reactions, to every peer. The client never stores or resends them.               |
| `client.subscribePeers(listener)`                                   | Reports a remote client that joins, changes its `user` or `context`, or leaves                            |
| `client.subscribeClose(listener)`                                   | Reports the close code and reason of each closed connection, and whether the transport reconnects         |
| `client.leave()`                                                    | Tells peers that the client left. The next publish announces it again.                                    |
| `parseUser`, `parseContext`, `parseEvent` options                   | Check, rewrite, or drop each remote `user`, `context`, and event                                          |
| `linearInterpolator`, `noneInterpolator`                            | Interpolation factories                                                                                   |

See [How it works](https://anchor-presence.vercel.app/docs/get-started/concepts/how-it-works), [Events](https://anchor-presence.vercel.app/docs/core/events), and [Codecs](https://anchor-presence.vercel.app/docs/core/codecs) for full guides.
