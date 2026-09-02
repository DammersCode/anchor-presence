# @anchor-presence/core

`@anchor-presence/core` is the protocol and orchestration layer of Anchor Presence. It holds the wire types, the validation rules, the presence store, and the client that ties them together.

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

Core imports no DOM, React, transport, or codec library, so it does not know what a browser is. Every browser API call lives in `@anchor-presence/dom`.

## Main exports

| Export | What it does |
|---|---|
| `createPresenceClient(options)` | Wires the transport, codec, publishing, sequencing, expiry, and the remote presence store into one client |
| `CursorPresence`, `AnchorPoint`, `CursorPosition` | Wire protocol types |
| `validatePresence(input, limits?)` | Validates and clamps an untrusted decoded value |
| `jsonCodec` | The default `CursorCodec` implementation |
| `LiveCursorTransport`, `ConnectionStatus` | The transport interface |
| `RemotePresenceStore` | Sequencing and stale-expiry store for remote presences |
| `linearInterpolator`, `noneInterpolator` | Interpolation factories |

See [docs/architecture.md](../../docs/architecture.md) and [docs/codecs.md](../../docs/codecs.md) in the repository root for full guides.
