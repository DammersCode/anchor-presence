# @anchor-presence/core

The protocol and orchestration layer of Anchor Presence.

[![MIT](https://img.shields.io/badge/license-MIT-blue.svg)](../../LICENSE)

```ts
import { createPresenceClient, jsonCodec } from "@anchor-presence/core";

const client = createPresenceClient({
  transport: myTransport,
  codec: jsonCodec, // default; pass a custom CursorCodec for a different wire format
  publishIntervalMs: 50,
});

client.updateLocalCursor({ anchors: [{ id: "nav.dashboard", u: 0.5, v: 0.5 }] });
client.subscribeRemote(() => {
  console.log(client.getRemoteSnapshot());
});
```

## Boundary rule

Core imports no DOM types at runtime, no React, no transport library, and no codec library. Core does not know what a browser is. Every browser API call lives in `@anchor-presence/dom`.

## Main exports

- `createPresenceClient(options)` — wires transport, codec, publishing, sequencing, expiry, and the remote presence store into one client
- `CursorPresence`, `AnchorPoint`, `CursorPosition` — wire protocol types
- `validatePresence(input, limits?)` — validates and clamps an untrusted decoded value
- `jsonCodec` — the default `CursorCodec` implementation
- `LiveCursorTransport`, `ConnectionStatus` — the transport interface
- `RemotePresenceStore` — sequencing and stale-expiry store for remote presences
- `linearInterpolator`, `noneInterpolator` — interpolation factories

See `docs/architecture.md`, `docs/transports.md`, and `docs/codecs.md` in the repository root for full guides.
